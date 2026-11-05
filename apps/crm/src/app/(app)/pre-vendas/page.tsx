import { redirect } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, gte, ilike, isNotNull, isNull, lte, or, type SQL } from "drizzle-orm";
import {
  Check, CheckCheck, Circle, Kanban as KanbanIcon, MessageCircle, Plus, Send, Target, User,
} from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { idsMembrosDaPlataforma } from "@/lib/colaboradores";
import {
  createPresalesStage, discardLead, handoffLead, moveLeadStatus, openWhatsappForPresalesLead, scheduleLeadTask,
} from "@/app/actions-presales";
import { sendMessage } from "@/app/actions-whatsapp";
import { PresalesBoard } from "@/components/presales/PresalesBoard";
import { PresalesFilters, type FilterValues } from "@/components/presales/PresalesFilters";
import { FunnelPicker, type FunnelItem } from "@/components/funnels/FunnelPicker";
import { loadFunnels, loadSectors, resolveCurrentFunnel } from "@/lib/funnels";
import { archiveFunnel, createFunnel, createSector, reorderFunnel, restoreFunnel } from "@/app/actions-funnels";
import type { BoardColumn, BoardLead, CloserOption } from "@/components/presales/types";
import { brl, daysSince, relTime } from "@/lib/format";
import { channelLabel } from "@/lib/presalesChannels";
import { buildStages, customStagesFromSettings, slaState, stageIndex, type PresalesStatus } from "@/lib/presalesFunnel";
import { estimateValor } from "@/lib/presalesEstimate";
import { carregarTabelaPrecos, produtoLabel } from "@/lib/produtos";
import { validateTransition } from "@/lib/presalesFunnel";

type SearchParams = {
  view?: string; c?: string; funil?: string;
  q?: string; sdr?: string; de?: string; ate?: string;
  qtyMin?: string; qtyMax?: string; sla?: string;
};

export default async function PreVendasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  if (!can(user.role, "view_presales")) redirect("/conta/senha");

  const params = await searchParams;
  const isChatView = params.view === "chat";

  const [funnels, sectors] = await Promise.all([
    loadFunnels(user.workspaceId, "presales"),
    loadSectors(user.workspaceId),
  ]);
  const current = resolveCurrentFunnel(funnels, params.funil);

  async function criarFunil(name: string, sectorId: string | null, color: string) {
    "use server";
    return createFunnel(name, sectorId, color, "presales");
  }
  async function criarSetor(name: string, color: string) {
    "use server";
    return createSector(name, color);
  }
  async function arquivar(id: string) {
    "use server";
    return archiveFunnel(id);
  }
  async function restaurar(id: string) {
    "use server";
    return restoreFunnel(id);
  }
  async function reordenar(id: string, direction: "up" | "down") {
    "use server";
    return reorderFunnel(id, direction);
  }

  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-xl text-[13px] font-semibold px-4 py-2.5 transition-colors ${
      active ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
    }`;

  return (
    <div className={isChatView ? "flex flex-col h-full" : "p-8"}>
      <div className={`flex flex-wrap items-end justify-between gap-4 ${isChatView ? "px-8 pt-8 pb-4" : "mb-5"}`}>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Pré-vendas (SDR)</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Esteira de qualificação — arraste o lead entre as etapas; o sistema cobra os dados que faltam.
          </p>
          {current && !isChatView && (
            <div className="mt-3">
              <FunnelPicker
                funnels={funnels}
                sectors={sectors}
                currentId={current.id}
                basePath="/pre-vendas"
                onCreate={criarFunil}
                onCreateSector={criarSetor}
                onArchive={arquivar}
                onRestore={restaurar}
                onReorder={reordenar}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/pre-vendas?view=kanban" className={tabClass(!isChatView)}>
            <KanbanIcon className="h-4 w-4" /> Kanban
          </Link>
          <Link href="/pre-vendas?view=chat" className={tabClass(isChatView)}>
            <MessageCircle className="h-4 w-4" /> Chat
          </Link>
          <Link href="/pre-vendas/novo"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 text-white text-[13px] font-semibold px-4 py-2.5 hover:bg-brand-600 shadow-sm transition-colors">
            <Plus className="h-4 w-4" /> Novo lead
          </Link>
        </div>
      </div>

      {isChatView ? (
        <PresalesChat user={{ workspaceId: user.workspaceId }} selectedId={params.c} />
      ) : (
        <PresalesBoardSection workspaceId={user.workspaceId} params={params} funnel={current} />
      )}
    </div>
  );
}

async function PresalesBoardSection({
  workspaceId,
  params,
  funnel,
}: {
  workspaceId: string;
  params: SearchParams;
  funnel: FunnelItem | null;
}) {
  // ─── Filtros em SQL (o de SLA é o único calculado depois, em JS) ──────────
  const conditions: SQL[] = [eq(s.presalesLeads.workspaceId, workspaceId)];

  const q = params.q?.trim();
  if (q) {
    const like = `%${q}%`;
    const match = or(ilike(s.presalesLeads.name, like), ilike(s.presalesLeads.phone, like));
    if (match) conditions.push(match);
  }
  if (params.sdr) conditions.push(eq(s.presalesLeads.ownerId, params.sdr));
  // Lead sem funil definido pertence ao padrão — assim nenhum lead anterior
  // aos múltiplos funis fica invisível.
  if (funnel) {
    const doFunil = funnel.isDefault
      ? or(eq(s.presalesLeads.pipelineId, funnel.id), isNull(s.presalesLeads.pipelineId))
      : eq(s.presalesLeads.pipelineId, funnel.id);
    if (doFunil) conditions.push(doFunil);
  }
  if (params.de) conditions.push(gte(s.presalesLeads.createdAt, new Date(`${params.de}T00:00:00-03:00`)));
  if (params.ate) conditions.push(lte(s.presalesLeads.createdAt, new Date(`${params.ate}T23:59:59-03:00`)));

  const qtyMin = parseInt(params.qtyMin ?? "", 10);
  const qtyMax = parseInt(params.qtyMax ?? "", 10);
  if (!Number.isNaN(qtyMin)) conditions.push(gte(s.presalesLeads.productQty, qtyMin));
  if (!Number.isNaN(qtyMax)) conditions.push(lte(s.presalesLeads.productQty, qtyMax));

  const [rows, members, workspace, history] = await Promise.all([
    db.select({
      lead: s.presalesLeads,
      ownerName: s.users.name,
    }).from(s.presalesLeads)
      .leftJoin(s.users, eq(s.users.id, s.presalesLeads.ownerId))
      .where(and(...conditions))
      .orderBy(desc(s.presalesLeads.updatedAt)),

    db.select({
      userId: s.workspaceMembers.userId,
      role: s.workspaceMembers.role,
      name: s.users.name,
    }).from(s.workspaceMembers)
      .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(eq(s.workspaceMembers.workspaceId, workspaceId)),

    db.select().from(s.workspaces).where(eq(s.workspaces.id, workspaceId)).then((r) => r[0] ?? null),

    // Histórico de transições — base da taxa de conversão por etapa.
    db.select({ leadId: s.activities.relatedToId, payload: s.activities.payload })
      .from(s.activities)
      .where(and(
        eq(s.activities.workspaceId, workspaceId),
        eq(s.activities.relatedToType, "presales_lead"),
      )),
  ]);

  const tabelaPrecos = await carregarTabelaPrecos(workspaceId);
  const stages = buildStages(customStagesFromSettings(workspace?.settings));

  // Nomes dos vendedores para exibir "entregue a …" nos cards.
  const nameById = new Map(members.map((m) => [m.userId, m.name]));

  // Seletores só com quem está na plataforma (as 15 + Admin/Gestão); `nameById` continua com todos, pro histórico.
  const naPlataforma = await idsMembrosDaPlataforma(workspaceId);
  const sdrs: CloserOption[] = members
    .filter((m) => naPlataforma.has(m.userId) && (m.role === "sdr" || m.role === "rep"))
    .map((m) => ({ id: m.userId, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const closers: CloserOption[] = members
    .filter((m) => naPlataforma.has(m.userId) && ["rep", "manager", "owner", "admin"].includes(m.role))
    .map((m) => ({ id: m.userId, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  // ─── Taxa de conversão por etapa ─────────────────────────────────────────
  // "Entrou na etapa" = está nela agora, ou o histórico registra entrada/saída.
  // "Avançou" = saiu dela para uma etapa posterior (descarte não conta).
  const entered = new Map<string, Set<string>>();
  const advanced = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, stage: string, leadId: string) => {
    if (!map.has(stage)) map.set(stage, new Set());
    map.get(stage)!.add(leadId);
  };

  for (const row of rows) add(entered, row.lead.status, row.lead.id);
  for (const h of history) {
    const payload = h.payload as { from?: string; to?: string };
    if (payload.to) add(entered, payload.to, h.leadId);
    if (payload.from) {
      add(entered, payload.from, h.leadId);
      const movedForward =
        payload.to != null &&
        payload.to !== "incompativel" &&
        stageIndex(payload.to, stages) > stageIndex(payload.from, stages);
      if (movedForward) add(advanced, payload.from, h.leadId);
    }
  }

  // ─── Monta os cards ──────────────────────────────────────────────────────
  const slaFilter = params.sla === "ok" || params.sla === "atrasado" ? params.sla : null;

  const allLeads: BoardLead[] = rows.map(({ lead, ownerName }) => {
    const estimate = estimateValor(lead, tabelaPrecos);
    const sla = slaState(lead.status, lead.stageEnteredAt, stages);
    const nextStage = stages[stageIndex(lead.status, stages) + 1];

    return {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      status: lead.status as PresalesStatus,
      city: lead.city,
      state: lead.state,
      produtoText: produtoLabel(lead.productLine, lead.productVariant, lead.productQty),
      originLabel: `${channelLabel(lead.channel)}${lead.socialNetwork ? ` · ${lead.socialNetwork}` : ""}`,
      channel: lead.channel,
      classification: lead.classification,
      ownerName,
      ownerInitials: ownerName ? initials(ownerName) : null,
      closerName: lead.closerId ? nameById.get(lead.closerId) ?? null : null,
      estimatedValueText: estimate ? brl(estimate.value) : null,
      estimatedValue: estimate?.value ?? 0,
      daysInStage: daysSince(lead.stageEnteredAt),
      sla,
      slaDays: stages.find((st) => st.id === lead.status)?.slaDays ?? null,
      daysSinceContact: lead.lastContactAt ? daysSince(lead.lastContactAt) : null,
      hasContact: lead.lastContactAt != null,
      attemptCount: lead.attemptCount,
      hasBill: !!lead.billFileUrl || lead.billReceivedAt != null || lead.prescriptionDate != null,
      lostReason: lead.lostReason,
      missingToAdvance: nextStage
        ? validateTransition(lead, lead.status, nextStage.id, stages).missing
        : [],
    };
  });

  const visibleLeads = slaFilter ? allLeads.filter((l) => l.sla === slaFilter) : allLeads;

  const customIds = new Set(customStagesFromSettings(workspace?.settings).map((c) => c.id));

  const columns: BoardColumn[] = stages.map((stage) => {
    const leads = visibleLeads.filter((l) => l.status === stage.id);
    const enteredCount = entered.get(stage.id)?.size ?? 0;
    const advancedCount = advanced.get(stage.id)?.size ?? 0;

    return {
      id: stage.id,
      label: stage.label,
      shortLabel: stage.shortLabel,
      terminal: !!stage.terminal,
      isLost: !!stage.isLost,
      slaDays: stage.slaDays,
      requires: [...stage.requires],
      isCustom: customIds.has(stage.id),
      count: leads.length,
      estimatedTotalText: brl(leads.reduce((total, l) => total + l.estimatedValue, 0)),
      conversionRate:
        stage.terminal || enteredCount === 0 ? null : Math.round((advancedCount / enteredCount) * 100),
      lateCount: leads.filter((l) => l.sla === "atrasado").length,
      leads,
    };
  });

  const filterValues: FilterValues = {
    q: params.q, sdr: params.sdr, de: params.de, ate: params.ate,
    qtyMin: params.qtyMin, qtyMax: params.qtyMax, sla: params.sla,
  };
  const activeFilterCount = Object.values(filterValues).filter((v) => v && String(v).trim()).length;

  async function move(leadId: string, toStatus: string) {
    "use server";
    return moveLeadStatus(leadId, toStatus);
  }
  async function handoff(leadId: string, closerId: string) {
    "use server";
    return handoffLead(leadId, closerId);
  }
  async function schedule(leadId: string, formData: FormData) {
    "use server";
    return scheduleLeadTask(leadId, formData);
  }
  async function discard(leadId: string, reason: string) {
    "use server";
    return discardLead(leadId, reason);
  }
  async function whatsapp(leadId: string) {
    "use server";
    await openWhatsappForPresalesLead(leadId);
  }
  async function createStage(label: string) {
    "use server";
    return createPresalesStage(label);
  }

  const pipelineTotal = visibleLeads.reduce((total, l) => total + l.estimatedValue, 0);
  const lateTotal = visibleLeads.filter((l) => l.sla === "atrasado").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-5">
        <Metric label="Leads no funil" value={String(visibleLeads.length)} />
        <Metric label="Pipeline estimado" value={brl(pipelineTotal)} tone="emerald" />
        <Metric label="Fora do SLA" value={String(lateTotal)} tone={lateTotal > 0 ? "red" : "zinc"} />
      </div>

      <PresalesFilters values={filterValues} sdrs={sdrs} activeCount={activeFilterCount} />

      <PresalesBoard
        columns={columns}
        closers={closers}
        moveAction={move}
        handoffAction={handoff}
        scheduleAction={schedule}
        discardAction={discard}
        whatsappAction={whatsapp}
        createStageAction={createStage}
      />
    </div>
  );
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function Metric({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: string;
  tone?: "zinc" | "emerald" | "red";
}) {
  const toneClass = tone === "emerald" ? "text-emerald-700" : tone === "red" ? "text-red-600" : "text-zinc-900";
  return (
    <div>
      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

async function PresalesChat({ user, selectedId }: { user: { workspaceId: string }; selectedId?: string }) {
  const conversations = await db.select({
    conv: s.whatsappConversations,
    ownerName: s.users.name,
  }).from(s.whatsappConversations)
    .leftJoin(s.users, eq(s.users.id, s.whatsappConversations.assignedTo))
    .where(and(eq(s.whatsappConversations.workspaceId, user.workspaceId), isNotNull(s.whatsappConversations.presalesLeadId)))
    .orderBy(desc(s.whatsappConversations.lastMessageAt));

  const active = selectedId
    ? conversations.find((c) => c.conv.id === selectedId)
    : conversations[0];

  if (active && active.conv.unreadCount > 0) {
    // Update direto (sem revalidatePath) — mesma ressalva da página /whatsapp.
    await db.update(s.whatsappConversations)
      .set({ unreadCount: 0 })
      .where(eq(s.whatsappConversations.id, active.conv.id));
  }

  const messages = active
    ? await db.select().from(s.whatsappMessages)
        .where(and(eq(s.whatsappMessages.conversationId, active.conv.id), eq(s.whatsappMessages.workspaceId, user.workspaceId)))
        .orderBy(s.whatsappMessages.createdAt)
    : [];

  const lead = active?.conv.presalesLeadId
    ? (await db.select().from(s.presalesLeads).where(eq(s.presalesLeads.id, active.conv.presalesLeadId)))[0]
    : null;

  async function sendAction(formData: FormData) {
    "use server";
    if (!active) return;
    await sendMessage(active.conv.id, formData);
  }

  const statusDot: Record<string, string> = {
    open: "bg-emerald-500", pending: "bg-brand-500", closed: "bg-zinc-400",
  };

  return (
    <div className="flex flex-1 min-h-0 border-t border-zinc-100">
      <div className="w-[340px] shrink-0 border-r border-zinc-100 bg-white flex flex-col overflow-y-auto">
        {conversations.map(({ conv, ownerName }) => {
          const isActive = active?.conv.id === conv.id;
          return (
            <Link key={conv.id} href={`/pre-vendas?view=chat&c=${conv.id}`}
              className={`flex items-start gap-3 px-4 py-3.5 border-b border-zinc-50 transition-colors ${
                isActive ? "bg-brand-50/70" : "hover:bg-zinc-50"
              }`}>
              <div className="relative shrink-0">
                <div className="h-11 w-11 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-white flex items-center justify-center text-xs font-bold">
                  {conv.contactName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${statusDot[conv.status]}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-zinc-900 truncate">{conv.contactName}</span>
                  <span className="text-[11px] text-zinc-400 shrink-0 tabular-nums">{relTime(conv.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-xs text-zinc-500 truncate">{conv.lastMessagePreview}</span>
                  {conv.unreadCount > 0 && (
                    <span className="shrink-0 h-4.5 min-w-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
                {ownerName && <div className="text-[10px] text-zinc-400 mt-1">{ownerName}</div>}
              </div>
            </Link>
          );
        })}
        {conversations.length === 0 && (
          <div className="p-8 text-center text-sm text-zinc-400">Nenhuma conversa de pré-venda ainda.</div>
        )}
      </div>

      {active ? (
        <div className="flex-1 flex flex-col bg-[#eef2f7] min-w-0">
          <div className="px-6 py-3.5 bg-white border-b border-zinc-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-white flex items-center justify-center text-xs font-bold">
                {active.conv.contactName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-900">{active.conv.contactName}</div>
                <div className="text-xs text-zinc-400 tabular-nums">{active.conv.phone}</div>
              </div>
            </div>
            {lead && (
              <Link href={`/pre-vendas/${lead.id}`}
                className="flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-50 rounded-lg px-3 py-1.5 hover:bg-brand-100 transition-colors">
                <Target className="h-3.5 w-3.5" /> {lead.name}
              </Link>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-2">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[65%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed shadow-sm ${
                  m.direction === "out" ? "bg-[#d9fdd3] text-zinc-800 rounded-br-sm" : "bg-white text-zinc-800 rounded-bl-sm"
                }`}>
                  {m.body}
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-zinc-400">{relTime(m.createdAt)}</span>
                    {m.direction === "out" && (
                      m.status === "failed"
                        ? <Circle className="h-3 w-3 text-red-400" />
                        : m.status === "read"
                        ? <CheckCheck className="h-3.5 w-3.5 text-sky-500" />
                        : <Check className="h-3.5 w-3.5 text-zinc-400" />
                    )}
                  </div>
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="m-auto text-center text-sm text-zinc-500">
                <MessageCircle className="h-8 w-8 mx-auto mb-2 text-zinc-400" />
                Nenhuma mensagem ainda.
              </div>
            )}
          </div>

          <form action={sendAction} className="px-6 py-4 bg-white border-t border-zinc-100 flex gap-2 shrink-0">
            <input name="body" required autoComplete="off" placeholder="Digite uma mensagem…"
              className="flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
            <button className="h-11 w-11 shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors">
              <Send className="h-4.5 w-4.5" />
            </button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-[#f7f9fc] text-zinc-400">
          <div className="text-center">
            <MessageCircle className="h-10 w-10 mx-auto mb-3" />
            Selecione uma conversa
          </div>
        </div>
      )}

      {active && (
        <div className="w-[280px] shrink-0 border-l border-zinc-100 bg-white p-5 space-y-4 overflow-y-auto">
          <div>
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-3">Contato</div>
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <User className="h-4 w-4 text-zinc-400" /> {active.conv.contactName}
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-500 mt-2 tabular-nums">
              {active.conv.phone}
            </div>
          </div>
          {lead && (
            <div>
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Origem</div>
              <p className="text-xs text-zinc-600">{channelLabel(lead.channel)}{lead.socialNetwork ? ` · ${lead.socialNetwork}` : ""}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
