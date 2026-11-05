"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { moveOpportunityStage } from "@/app/actions";

// ─── Discador ────────────────────────────────────────────────────────────────

export type CallOutcome = "answered" | "no_answer" | "voicemail" | "not_interested";

const outcomeText: Record<CallOutcome, string> = {
  answered: "Ligação atendida — conversa registrada pelo discador.",
  no_answer: "Ligação não atendida — cliente volta para o fim da fila do discador.",
  voicemail: "Caiu na caixa postal — cliente volta para o fim da fila do discador.",
  not_interested: "Cliente sem interesse — oportunidade marcada como perdida pelo discador.",
};

export async function registerCallOutcome(opportunityId: string, outcome: CallOutcome, note?: string) {
  const user = await requireUser();

  const [opp] = await db.select().from(s.opportunities)
    .where(and(eq(s.opportunities.id, opportunityId), eq(s.opportunities.workspaceId, user.workspaceId)));
  if (!opp) return;

  const text = note?.trim() ? `${outcomeText[outcome]} Obs.: ${note.trim()}` : outcomeText[outcome];
  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "opportunity", relatedToId: opportunityId,
    type: "call_logged", payload: { text, outcome },
  });

  if (outcome === "not_interested") {
    const [lostStage] = await db.select().from(s.pipelineStages)
      .where(and(eq(s.pipelineStages.pipelineId, opp.pipelineId), eq(s.pipelineStages.isLost, true)));
    if (lostStage) {
      await moveOpportunityStage(opportunityId, lostStage.id);
      await db.update(s.opportunities).set({ lostReason: "Sem interesse (discador)" })
        .where(eq(s.opportunities.id, opportunityId));
    }
  }

  revalidatePath("/discador");
  revalidatePath(`/oportunidades/${opportunityId}`);
}

// ─── Discador: prospecção avulsa (lista importada) ────────────────────────────

const dialerOutcomeText: Record<string, string> = {
  answered: "Atendeu — chamada avulsa do discador.",
  no_answer: "Não atendeu — chamada avulsa do discador.",
  voicemail: "Caixa postal — chamada avulsa do discador.",
  wrong_number: "Número errado/inexistente — chamada avulsa do discador.",
  not_interested: "Sem interesse — chamada avulsa do discador.",
};

// Aceita uma linha por contato: só telefone, ou "nome,telefone" /
// "nome;telefone" / "nome<TAB>telefone". Qualquer sequência de 8+ dígitos na
// linha é lida como telefone; o resto da linha (se sobrar texto) vira nome.
function parseDialerList(raw: string): { name: string; phone: string }[] {
  const out: { name: string; phone: string }[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const phoneMatch = line.match(/(\+?\d[\d\s().-]{7,}\d)/);
    if (!phoneMatch) continue;
    const phone = phoneMatch[0].replace(/[^\d+]/g, "");
    const name = line.replace(phoneMatch[0], "").replace(/^[,;\t]+|[,;\t]+$/g, "").trim();
    out.push({ name: name || phone, phone });
  }
  return out;
}

export async function importDialerList(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) return;

  const raw = await file.text();
  const contacts = parseDialerList(raw);
  if (contacts.length === 0) return;

  const [batch] = await db.insert(s.dialerImports).values({
    workspaceId: user.workspaceId,
    name: String(formData.get("name") ?? "").trim() || file.name,
    uploadedBy: user.id,
    totalContacts: contacts.length,
  }).returning();

  await db.insert(s.dialerImportContacts).values(
    contacts.map((c) => ({
      importId: batch.id,
      workspaceId: user.workspaceId,
      name: c.name,
      phone: c.phone,
    })),
  );

  revalidatePath("/discador");
}

export async function registerDialerImportOutcome(contactId: string, outcome: CallOutcome | "wrong_number", note?: string) {
  const user = await requireUser();

  const [contact] = await db.select().from(s.dialerImportContacts)
    .where(and(eq(s.dialerImportContacts.id, contactId), eq(s.dialerImportContacts.workspaceId, user.workspaceId)));
  if (!contact) return;

  await db.update(s.dialerImportContacts).set({
    status: "done",
    outcome,
    calledBy: user.id,
    calledAt: new Date(),
  }).where(eq(s.dialerImportContacts.id, contactId));

  if (outcome === "answered") {
    const [existing] = await db.select().from(s.presalesLeads)
      .where(and(eq(s.presalesLeads.workspaceId, user.workspaceId), eq(s.presalesLeads.phone, contact.phone)));
    if (!existing) {
      await db.insert(s.presalesLeads).values({
        workspaceId: user.workspaceId,
        name: contact.name,
        phone: contact.phone,
        channel: "prospeccao",
        status: "em_contato",
        ownerId: user.id,
        lastContactAt: new Date(),
        attemptCount: 1,
        notes: note?.trim() || null,
      });
    }
  }

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "contact", relatedToId: contact.id,
    type: "call_logged", payload: { text: dialerOutcomeText[outcome], outcome, phone: contact.phone, name: contact.name },
  });

  revalidatePath("/discador");
}

export async function setCommissionStatus(commissionId: string, status: "approved" | "paid") {
  const user = await requireUser();
  const [c] = await db.select().from(s.commissions)
    .where(and(eq(s.commissions.id, commissionId), eq(s.commissions.workspaceId, user.workspaceId)));
  if (!c) return;
  await db.update(s.commissions).set({
    status,
    approvedAt: status === "approved" ? new Date() : c.approvedAt,
    paidAt: status === "paid" ? new Date() : c.paidAt,
  }).where(eq(s.commissions.id, commissionId));
  revalidatePath("/comissoes");
}
