"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { channelLabel, type PresalesChannel } from "@/lib/presalesChannels";
import {
  buildStages, customStagesFromSettings, PRESALES_STAGES, slugifyStageId,
  stageLabel, validateTransition, type PresalesStatus,
} from "@/lib/presalesFunnel";
import { presalesConfig } from "@/lib/presalesConfig";
import { estimateValor } from "@/lib/presalesEstimate";
import { carregarTabelaPrecos } from "@/lib/produtos";
import { sendWhatsappMessage } from "@/lib/whatsapp";

/** Resultado padrão das ações que podem ser recusadas por falta de dados. */
export type ActionResult = { ok: boolean; error?: string; missing?: string[] };

async function loadLead(leadId: string, workspaceId: string) {
  const [lead] = await db.select().from(s.presalesLeads)
    .where(and(eq(s.presalesLeads.id, leadId), eq(s.presalesLeads.workspaceId, workspaceId)));
  return lead ?? null;
}

async function loadWorkspace(workspaceId: string) {
  const [workspace] = await db.select().from(s.workspaces).where(eq(s.workspaces.id, workspaceId));
  return workspace ?? null;
}

/** Etapas do funil deste workspace: as fixas + as colunas personalizadas criadas. */
async function loadStages(workspaceId: string) {
  const workspace = await loadWorkspace(workspaceId);
  return { workspace, stages: buildStages(customStagesFromSettings(workspace?.settings)) };
}

function revalidateLead(leadId: string) {
  revalidatePath("/pre-vendas");
  revalidatePath(`/pre-vendas/${leadId}`);
}

const LGPD_CONSENT_TEXT =
  "Oi! Aqui é da Lovet Distribuidora 👋 Recebemos seu contato e, pra falar com você, precisamos guardar seu " +
  "nome e telefone conforme a LGPD (Lei Geral de Proteção de Dados). Usamos isso só pra te atender " +
  "e não compartilhamos com ninguém. Se preferir não continuar, é só responder \"remover\" a qualquer momento.";

/**
 * Confirmação LGPD automática na criação do lead — resiliente de propósito:
 * falha de envio (WhatsApp fora do ar, número inválido etc.) nunca derruba a
 * criação do lead, só fica registrada na atividade pra alguém acompanhar.
 */
async function sendLgpdConsent(workspaceId: string, leadId: string, phone: string) {
  try {
    const result = await sendWhatsappMessage(phone, LGPD_CONSENT_TEXT);
    await db.update(s.presalesLeads).set({ lgpdConsentSentAt: new Date() }).where(eq(s.presalesLeads.id, leadId));
    await db.insert(s.activities).values({
      workspaceId, actorId: null, actorType: "system",
      relatedToType: "presales_lead", relatedToId: leadId,
      type: "note",
      payload: { text: result.ok ? "Confirmação LGPD enviada por WhatsApp." : `Falha ao enviar confirmação LGPD: ${result.error}` },
    });
  } catch (e) {
    await db.insert(s.activities).values({
      workspaceId, actorId: null, actorType: "system",
      relatedToType: "presales_lead", relatedToId: leadId,
      type: "note", payload: { text: `Falha ao enviar confirmação LGPD: ${e instanceof Error ? e.message : "erro desconhecido"}` },
    });
  }
}

// ─── Criação ─────────────────────────────────────────────────────────────────

export async function createPresalesLead(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) throw new Error("FORBIDDEN");

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name || !phone) return;

  const channel = (String(formData.get("channel") ?? "outro") || "outro") as PresalesChannel;
  const qty = parseInt(String(formData.get("productQty") ?? ""), 10);
  const costPerLead = String(formData.get("costPerLead") ?? "").replace(",", ".").trim();

  const [lead] = await db.insert(s.presalesLeads).values({
    workspaceId: user.workspaceId,
    name,
    phone,
    email: String(formData.get("email") ?? "").trim() || null,
    channel,
    socialNetwork: String(formData.get("socialNetwork") ?? "").trim() || null,
    visitReason: String(formData.get("visitReason") ?? "").trim() || null,
    costPerLead: costPerLead || "0.33",
    notes: String(formData.get("notes") ?? "").trim() || null,
    pontoAtendimento: String(formData.get("pontoAtendimento") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    state: String(formData.get("state") ?? "").trim().toUpperCase() || null,
    productQty: Number.isNaN(qty) || qty < 1 ? null : qty,
    ownerId: user.id,
  }).returning();

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "presales_lead", relatedToId: lead.id,
    type: "note", payload: { text: "Lead de pré-venda criado." },
  });

  // Assíncrono e resiliente: aguardamos o envio (pra registrar o resultado na
  // atividade), mas nenhuma falha aqui impede a criação do lead, que já
  // aconteceu acima.
  await sendLgpdConsent(user.workspaceId, lead.id, phone);

  revalidatePath("/pre-vendas");
  redirect(`/pre-vendas/${lead.id}`);
}

// ─── Movimentação entre etapas ───────────────────────────────────────────────

/**
 * Move o lead de etapa, validando os campos obrigatórios do funil.
 * Ao entrar em "aguardando_vendedor" com um vendedor escolhido, registra a
 * passagem de bastão (ver handoffLead).
 */
export async function moveLeadStatus(leadId: string, toStatus: string): Promise<ActionResult> {
  const user = await requireUser();

  const lead = await loadLead(leadId, user.workspaceId);
  if (!lead) return { ok: false, error: "Lead não encontrado." };
  if (lead.status === toStatus) return { ok: true };

  // "Convertido" não é um destino manual: virar oportunidade passa por
  // promoteToOpportunity, que cria empresa, contato e o card no funil de
  // vendas. Mover à mão deixaria o lead convertido sem oportunidade.
  if (toStatus === "convertido") {
    return {
      ok: false,
      error: "Para converter, use “Aceitar e criar oportunidade” na tela do lead.",
    };
  }

  const { stages } = await loadStages(user.workspaceId);
  const check = validateTransition(lead, lead.status, toStatus, stages);
  if (!check.ok) {
    return {
      ok: false,
      error: `Para mover para “${stageLabel(toStatus, stages)}” faltam dados no lead.`,
      missing: check.missing,
    };
  }

  await db.update(s.presalesLeads).set({
    status: toStatus as PresalesStatus,
    stageEnteredAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(s.presalesLeads.id, leadId));

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "presales_lead", relatedToId: leadId,
    type: "presales_status_changed",
    payload: { from: lead.status, to: toStatus, text: `Etapa alterada para “${stageLabel(toStatus)}”.` },
  });

  revalidateLead(leadId);
  return { ok: true };
}

/** Registra uma tentativa de contato (liga o SLA de "em contato"). */
export async function registerContactAttempt(leadId: string, note?: string): Promise<ActionResult> {
  const user = await requireUser();

  const lead = await loadLead(leadId, user.workspaceId);
  if (!lead) return { ok: false, error: "Lead não encontrado." };

  await db.update(s.presalesLeads).set({
    attemptCount: lead.attemptCount + 1,
    lastContactAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(s.presalesLeads.id, leadId));

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "presales_lead", relatedToId: leadId,
    type: "call_logged",
    payload: { text: note?.trim() || `Tentativa de contato registrada (${lead.attemptCount + 1}ª).` },
  });

  revalidateLead(leadId);
  return { ok: true };
}

/** Salva os dados de qualificação (produto, ponto de atendimento, receita, local). */
export async function updateLeadQualification(leadId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const lead = await loadLead(leadId, user.workspaceId);
  if (!lead) return { ok: false, error: "Lead não encontrado." };

  const productLine = String(formData.get("productLine") ?? "").trim();
  const productVariant = String(formData.get("productVariant") ?? "").trim();
  const qty = parseInt(String(formData.get("productQty") ?? ""), 10);
  const billUrl = String(formData.get("billFileUrl") ?? "").trim();
  const billReceived = String(formData.get("billReceived") ?? "") === "on";
  const prescriptionDateStr = String(formData.get("prescriptionDate") ?? "").trim();

  await db.update(s.presalesLeads).set({
    pontoAtendimento: String(formData.get("pontoAtendimento") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    state: String(formData.get("state") ?? "").trim().toUpperCase() || null,
    productLine: productLine || null,
    productVariant: productVariant || null,
    productQty: Number.isNaN(qty) || qty < 1 ? null : qty,
    billFileUrl: billUrl || null,
    // Marca o recebimento uma vez; não apaga a data já registrada.
    billReceivedAt: billReceived || billUrl ? (lead.billReceivedAt ?? new Date()) : null,
    // "T00:00:00" (sem Z) faz o JS interpretar como meia-noite local, não
    // UTC — sem isso, um fuso atrás de UTC (ex.: America/Sao_Paulo) mostra o
    // dia anterior ao que foi digitado.
    prescriptionDate: prescriptionDateStr ? new Date(`${prescriptionDateStr}T00:00:00`) : lead.prescriptionDate,
    updatedAt: new Date(),
  }).where(eq(s.presalesLeads.id, leadId));

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "presales_lead", relatedToId: leadId,
    type: "note", payload: { text: "Dados de qualificação atualizados." },
  });

  // Qualificação automática: toda vez que o lead ganha uma receita (data,
  // link ou confirmação de recebimento) e já cumpre os demais requisitos da
  // etapa, ele avança sozinho pra "Aguardando vendedor / Qualificado" — sem
  // pular etapa se ainda faltar outro dado (qtd., ponto de atendimento, UF).
  await tryAutoQualify(user.workspaceId, leadId);

  revalidateLead(leadId);
  return { ok: true };
}

/**
 * Tenta avançar o lead até "aguardando_vendedor" (Lead Qualificado) sozinho.
 * Só avança se validateTransition aprovar — nunca pula um requisito faltando.
 * Reaproveitada por updateLeadQualification (receita) hoje; serve pra
 * qualquer outro gatilho de auto-qualificação que apareça depois.
 */
async function tryAutoQualify(workspaceId: string, leadId: string) {
  const fresh = await loadLead(leadId, workspaceId);
  const preQualifiedStatuses = new Set(["sem_contato", "em_contato", "qualificacao"]);
  if (!fresh || !preQualifiedStatuses.has(fresh.status)) return;

  const { stages } = await loadStages(workspaceId);
  const check = validateTransition(fresh, fresh.status, "aguardando_vendedor", stages);
  if (!check.ok) return;

  await db.update(s.presalesLeads).set({
    status: "aguardando_vendedor",
    stageEnteredAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(s.presalesLeads.id, leadId));

  await db.insert(s.activities).values({
    workspaceId, actorId: null, actorType: "system",
    relatedToType: "presales_lead", relatedToId: leadId,
    type: "presales_status_changed",
    payload: { from: fresh.status, to: "aguardando_vendedor", text: "Lead qualificado automaticamente (receita cadastrada)." },
  });
}

export async function setLeadClassification(leadId: string, classification: "quente" | "morno" | "frio") {
  const user = await requireUser();

  const lead = await loadLead(leadId, user.workspaceId);
  if (!lead) return;

  await db.update(s.presalesLeads).set({ classification, updatedAt: new Date() })
    .where(eq(s.presalesLeads.id, leadId));

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "presales_lead", relatedToId: leadId,
    type: "note", payload: { text: `Classificação definida: ${classification}.` },
  });

  revalidateLead(leadId);
}

/** Marca o lead como incompatível/perdido — exige motivo. */
export async function discardLead(leadId: string, reason: string): Promise<ActionResult> {
  const user = await requireUser();

  const lead = await loadLead(leadId, user.workspaceId);
  if (!lead) return { ok: false, error: "Lead não encontrado." };
  if (!reason.trim()) {
    return { ok: false, error: "Informe o motivo.", missing: ["motivo da incompatibilidade"] };
  }

  await db.update(s.presalesLeads).set({
    status: "incompativel", lostReason: reason.trim(),
    stageEnteredAt: new Date(), updatedAt: new Date(),
  }).where(eq(s.presalesLeads.id, leadId));

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "presales_lead", relatedToId: leadId,
    type: "presales_status_changed",
    payload: { from: lead.status, to: "incompativel", text: `Lead incompatível: ${reason.trim()}` },
  });

  revalidateLead(leadId);
  return { ok: true };
}

// ─── Colunas personalizadas ──────────────────────────────────────────────────

/**
 * Cria uma coluna extra no quadro (workspace todo, não só quem pediu).
 * Fica salva em `workspaces.settings.presales.customStages` — sem SLA e sem
 * campo obrigatório, só para organizar leads que não cabem nas etapas fixas.
 */
export async function createPresalesStage(label: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) return { ok: false, error: "Sem permissão para criar colunas." };

  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Informe o nome da coluna." };
  if (trimmed.length > 40) return { ok: false, error: "Nome muito longo (máx. 40 caracteres)." };

  const workspace = await loadWorkspace(user.workspaceId);
  const settings = { ...((workspace?.settings as Record<string, unknown> | null) ?? {}) };
  const presales = { ...((settings.presales as Record<string, unknown> | undefined) ?? {}) };
  const existing = customStagesFromSettings(workspace?.settings);

  if (existing.some((c) => c.label.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: "Já existe uma coluna com esse nome." };
  }

  const reserved = new Set(PRESALES_STAGES.map((st) => st.id));
  const base = slugifyStageId(trimmed);
  let id = base;
  let n = 2;
  while (reserved.has(id) || existing.some((c) => c.id === id)) id = `${base}_${n++}`;

  presales.customStages = [...existing, { id, label: trimmed }];
  settings.presales = presales;

  await db.update(s.workspaces).set({ settings }).where(eq(s.workspaces.id, user.workspaceId));

  revalidatePath("/pre-vendas");
  return { ok: true };
}

// ─── Passagem de bastão ──────────────────────────────────────────────────────

/**
 * Passagem de bastão: o SDR entrega o lead qualificado a um vendedor.
 * Valida os dados obrigatórios da etapa, move o lead para
 * "aguardando_vendedor", grava o evento em presalesHandoffs com a comissão
 * fixa do SDR e congela a estimativa do sistema naquele momento.
 */
export async function handoffLead(leadId: string, closerId: string): Promise<ActionResult> {
  const user = await requireUser();

  const lead = await loadLead(leadId, user.workspaceId);
  if (!lead) return { ok: false, error: "Lead não encontrado." };
  if (!closerId) return { ok: false, error: "Escolha o vendedor que vai receber o lead." };

  const { workspace, stages } = await loadStages(user.workspaceId);
  const check = validateTransition(lead, lead.status, "aguardando_vendedor", stages);
  if (!check.ok) {
    return { ok: false, error: "O lead ainda não está qualificado.", missing: check.missing };
  }

  const [closer] = await db.select().from(s.workspaceMembers)
    .where(and(eq(s.workspaceMembers.workspaceId, user.workspaceId), eq(s.workspaceMembers.userId, closerId)));
  if (!closer) return { ok: false, error: "Vendedor não encontrado neste workspace." };

  const config = presalesConfig(workspace?.settings);
  const estimate = estimateValor(lead, await carregarTabelaPrecos(user.workspaceId));

  await db.insert(s.presalesHandoffs).values({
    workspaceId: user.workspaceId,
    leadId: lead.id,
    sdrId: lead.ownerId ?? user.id,
    closerId,
    commissionAmount: String(config.sdrCommissionPerLead),
    estimatedQty: estimate?.qtd ?? null,
    estimatedValue: estimate ? String(estimate.value) : null,
  });

  await db.update(s.presalesLeads).set({
    status: "aguardando_vendedor",
    closerId,
    handedOffAt: new Date(),
    stageEnteredAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(s.presalesLeads.id, leadId));

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "presales_lead", relatedToId: leadId,
    type: "presales_handoff",
    payload: {
      from: lead.status, to: "aguardando_vendedor",
      text: `Passagem de bastão registrada — lead entregue para fechamento. Comissão do SDR: R$ ${config.sdrCommissionPerLead}.`,
    },
  });

  revalidateLead(leadId);
  revalidatePath("/pipeline");
  return { ok: true };
}

// ─── Conversão em oportunidade ───────────────────────────────────────────────

/**
 * Promove o lead a oportunidade de verdade (empresa + contato + card na 1ª
 * etapa do funil de vendas). O dono da oportunidade é o vendedor que recebeu
 * na passagem de bastão, se houver. Aceita o handoff pendente.
 */
export async function promoteToOpportunity(leadId: string) {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) throw new Error("FORBIDDEN");

  const lead = await loadLead(leadId, user.workspaceId);
  if (!lead || lead.status === "convertido") return;

  const [pipe] = await db.select().from(s.pipelines)
    .where(and(eq(s.pipelines.workspaceId, user.workspaceId), eq(s.pipelines.kind, "sales")));
  const [firstStage] = await db.select().from(s.pipelineStages)
    .where(eq(s.pipelineStages.pipelineId, pipe.id)).orderBy(asc(s.pipelineStages.order)).limit(1);

  let [company] = await db.select().from(s.companies)
    .where(and(eq(s.companies.workspaceId, user.workspaceId), eq(s.companies.name, lead.name)));
  if (!company) {
    [company] = await db.insert(s.companies).values({
      workspaceId: user.workspaceId, name: lead.name, industry: "Pessoa Física",
      ownerId: lead.closerId ?? user.id,
    }).returning();
  }

  let [contact] = await db.select().from(s.contacts)
    .where(and(eq(s.contacts.workspaceId, user.workspaceId), eq(s.contacts.companyId, company.id)))
    .limit(1);
  if (!contact) {
    [contact] = await db.insert(s.contacts).values({
      workspaceId: user.workspaceId, companyId: company.id, name: lead.name,
      phone: lead.phone, email: lead.email, ownerId: lead.closerId ?? user.id,
    }).returning();
  }

  // Leva a cidade coletada na pré-venda para o cadastro do cliente.
  if (lead.city) {
    await db.update(s.companies).set({ customFields: { cidade: lead.city, uf: lead.state ?? null } })
      .where(eq(s.companies.id, company.id));
  }

  const estimate = estimateValor(lead, await carregarTabelaPrecos(user.workspaceId));
  const leadSource = `${channelLabel(lead.channel)}${lead.socialNetwork ? ` · ${lead.socialNetwork}` : ""}`;

  const [opp] = await db.insert(s.opportunities).values({
    workspaceId: user.workspaceId,
    pipelineId: pipe.id,
    stageId: firstStage.id,
    companyId: company.id,
    primaryContactId: contact.id,
    ownerId: lead.closerId ?? user.id,
    name: lead.name,
    leadSource,
    amount: estimate ? String(estimate.value) : null,
    productLine: lead.productLine,
    productVariant: lead.productVariant,
    productQty: estimate?.qtd ?? null,
  }).returning();

  await db.insert(s.opportunityStageHistory).values({
    opportunityId: opp.id, fromStageId: null, toStageId: firstStage.id, changedBy: user.id,
  });
  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "opportunity", relatedToId: opp.id,
    type: "note", payload: { text: "Oportunidade criada a partir de um lead de pré-venda." },
  });

  // Aceita o handoff pendente — o vendedor assumiu o lead.
  const [handoff] = await db.select().from(s.presalesHandoffs)
    .where(and(eq(s.presalesHandoffs.leadId, leadId), eq(s.presalesHandoffs.status, "pending")));
  if (handoff) {
    await db.update(s.presalesHandoffs)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(s.presalesHandoffs.id, handoff.id));
  }

  await db.update(s.presalesLeads).set({
    status: "convertido", convertedOpportunityId: opp.id,
    stageEnteredAt: new Date(), updatedAt: new Date(),
  }).where(eq(s.presalesLeads.id, leadId));
  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "presales_lead", relatedToId: leadId,
    type: "presales_status_changed",
    payload: { from: lead.status, to: "convertido", text: "Lead promovido a oportunidade." },
  });

  revalidatePath("/pre-vendas");
  revalidatePath("/pipeline");
  redirect(`/oportunidades/${opp.id}`);
}

// ─── Tarefas e WhatsApp ──────────────────────────────────────────────────────

/** Agenda uma ligação/tarefa para o lead (ação rápida do card). */
export async function scheduleLeadTask(leadId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const lead = await loadLead(leadId, user.workspaceId);
  if (!lead) return { ok: false, error: "Lead não encontrado." };

  const title = String(formData.get("title") ?? "").trim() || `Ligar para ${lead.name}`;
  const dueDate = String(formData.get("dueAt") ?? "").trim();
  const type = (String(formData.get("type") ?? "call") || "call") as "call" | "meeting" | "todo";

  await db.insert(s.tasks).values({
    workspaceId: user.workspaceId,
    relatedToType: "presales_lead",
    relatedToId: leadId,
    assigneeId: lead.ownerId ?? user.id,
    createdBy: user.id,
    type,
    title,
    dueAt: dueDate ? new Date(`${dueDate}T09:00:00`) : null,
  });

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "presales_lead", relatedToId: leadId,
    type: "note", payload: { text: `Tarefa agendada: ${title}` },
  });

  revalidateLead(leadId);
  revalidatePath("/tarefas");
  return { ok: true };
}

/** Encontra (ou cria) a conversa de WhatsApp do lead e vincula os dois. */
export async function findOrCreateConversationForPresalesLead(leadId: string): Promise<string | null> {
  const user = await requireUser();

  const lead = await loadLead(leadId, user.workspaceId);
  if (!lead?.phone) return null;

  let [conv] = await db.select().from(s.whatsappConversations)
    .where(and(eq(s.whatsappConversations.workspaceId, user.workspaceId), eq(s.whatsappConversations.phone, lead.phone)));

  if (!conv) {
    [conv] = await db.insert(s.whatsappConversations).values({
      workspaceId: user.workspaceId,
      presalesLeadId: lead.id,
      phone: lead.phone,
      contactName: lead.name,
      assignedTo: lead.ownerId ?? user.id,
      lastMessagePreview: "Conversa iniciada a partir do lead de pré-venda.",
    }).returning();
  } else if (!conv.presalesLeadId) {
    await db.update(s.whatsappConversations).set({ presalesLeadId: lead.id }).where(eq(s.whatsappConversations.id, conv.id));
  }

  return conv.id;
}

export async function openWhatsappForPresalesLead(leadId: string) {
  const convId = await findOrCreateConversationForPresalesLead(leadId);
  redirect(convId ? `/pre-vendas?view=chat&c=${convId}` : "/pre-vendas");
}
