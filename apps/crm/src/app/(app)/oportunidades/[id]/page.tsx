import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  ArrowRight, BadgeCheck, Check, FileText, MessageCircle, Phone, Plus, Sparkles, StickyNote, Target, User, UserCheck, X,
} from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { addNote, moveOpportunityStage } from "@/app/actions";
import { createProposal } from "@/app/actions-create";
import { gerarPropostaDeReferencia } from "@/app/actions-ai";
import { openWhatsappForOpportunity } from "@/app/actions-whatsapp";
import { AiButton } from "@/components/AiButton";
import { brl, dateBR, daysSince, relTime } from "@/lib/format";
import { produtoLabel, VARIANTES, PRODUTOS } from "@/lib/produtos";
import { channelLabel, CLASSIFICATION_LABELS } from "@/lib/presalesChannels";

export default async function OportunidadePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const [row] = await db.select({
    opp: s.opportunities,
    stageName: s.pipelineStages.name,
    companyName: s.companies.name,
    companyIndustry: s.companies.industry,
    contactName: s.contacts.name,
    contactPhone: s.contacts.phone,
    contactEmail: s.contacts.email,
    ownerName: s.users.name,
  }).from(s.opportunities)
    .innerJoin(s.pipelineStages, eq(s.pipelineStages.id, s.opportunities.stageId))
    .leftJoin(s.companies, eq(s.companies.id, s.opportunities.companyId))
    .leftJoin(s.contacts, eq(s.contacts.id, s.opportunities.primaryContactId))
    .leftJoin(s.users, eq(s.users.id, s.opportunities.ownerId))
    .where(and(eq(s.opportunities.id, id), eq(s.opportunities.workspaceId, user.workspaceId)));

  if (!row) notFound();
  const { opp } = row;

  // Caminho linear: as etapas do funil em ordem, com a próxima ação sempre visível
  const stages = await db.select().from(s.pipelineStages)
    .where(eq(s.pipelineStages.pipelineId, opp.pipelineId))
    .orderBy(asc(s.pipelineStages.order));
  const pathStages = stages.filter((st) => !st.isLost);
  const lostStage = stages.find((st) => st.isLost);
  const currentIdx = pathStages.findIndex((st) => st.id === opp.stageId);
  const nextStage = opp.status === "open" && currentIdx >= 0 ? pathStages[currentIdx + 1] : undefined;

  const [acts, props] = await Promise.all([
    db.select({ act: s.activities, actorName: s.users.name }).from(s.activities)
      .leftJoin(s.users, eq(s.users.id, s.activities.actorId))
      .where(and(eq(s.activities.relatedToType, "opportunity"), eq(s.activities.relatedToId, id)))
      .orderBy(desc(s.activities.createdAt)),
    db.select().from(s.proposals).where(eq(s.proposals.opportunityId, id)).orderBy(asc(s.proposals.version)),
  ]);
  const [sourceLead] = await db.select({ lead: s.presalesLeads, sdrName: s.users.name }).from(s.presalesLeads)
    .leftJoin(s.users, eq(s.users.id, s.presalesLeads.ownerId))
    .where(eq(s.presalesLeads.convertedOpportunityId, id));

  const showFinancials = can(user.role, "view_financials");
  const showPresalesOrigin = can(user.role, "view_presales");

  async function addNoteAction(formData: FormData) {
    "use server";
    await addNote(id, String(formData.get("text") ?? ""));
  }

  async function propostaReferenciaAction() {
    "use server";
    return gerarPropostaDeReferencia(id);
  }

  const statusBadge = opp.status === "won"
    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1"><Check className="h-3 w-3" strokeWidth={3} />Ganho</span>
    : opp.status === "lost"
    ? <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold px-3 py-1"><X className="h-3 w-3" strokeWidth={3} />Perdido</span>
    : <span className="rounded-full bg-brand-100 text-brand-700 text-xs font-semibold px-3 py-1">{row.stageName}</span>;

  const actIcon: Record<string, React.ReactNode> = {
    note: <StickyNote className="h-3.5 w-3.5" />,
    call_logged: <Phone className="h-3.5 w-3.5" />,
    stage_changed: <Target className="h-3.5 w-3.5" />,
    ai_suggestion: <Sparkles className="h-3.5 w-3.5" />,
  };

  const card = "rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)]";
  const cardHeader = "px-5 py-4 border-b border-zinc-100 flex items-center gap-2 font-semibold text-sm text-zinc-800";

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <div className="flex items-start justify-between mb-7 gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">{opp.name}</h1>
            {statusBadge}
          </div>
          <p className="text-sm text-zinc-500 mt-1.5">
            {row.companyName} {row.companyIndustry ? `· ${row.companyIndustry}` : ""} · Responsável: {row.ownerName}
            {opp.leadSource ? ` · Origem: ${opp.leadSource}` : ""}
          </p>
          {opp.status === "lost" && opp.lostReason && (
            <p className="text-sm text-red-600 mt-1">Motivo da perda: {opp.lostReason}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          {showFinancials && <div className="text-[26px] font-bold text-emerald-700 tabular-nums tracking-tight">{brl(opp.amount)}</div>}
          <div className="text-sm text-zinc-500 flex items-center justify-end gap-1">
            <BadgeCheck className="h-3.5 w-3.5 text-brand-500" />
            {produtoLabel(opp.productLine, opp.productVariant, opp.productQty) ?? "—"}{showFinancials && opp.expectedCloseDate ? ` · fecha ${dateBR(opp.expectedCloseDate)}` : ""}
          </div>
        </div>
      </div>

      {/* Caminho linear da venda */}
      <div className={`${card} p-5 mb-5`}>
        <div className="flex items-center gap-0">
          {pathStages.map((st, i) => {
            const done = currentIdx > i || opp.status === "won";
            const current = currentIdx === i && opp.status === "open";
            return (
              <div key={st.id} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5 min-w-0">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    done ? "bg-emerald-500 text-white"
                    : current ? "bg-brand-500 text-white ring-4 ring-brand-100"
                    : "bg-zinc-100 text-zinc-400"
                  }`}>
                    {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                  </div>
                  <span className={`text-[10px] font-medium text-center leading-tight ${current ? "text-brand-700" : done ? "text-emerald-700" : "text-zinc-400"}`}>
                    {st.name}
                  </span>
                </div>
                {i < pathStages.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-2 mb-5 rounded ${currentIdx > i || opp.status === "won" ? "bg-emerald-400" : "bg-zinc-100"}`} />
                )}
              </div>
            );
          })}
        </div>
        {opp.status === "open" && (nextStage || lostStage) && (
          <div className="flex items-center gap-2 mt-5 pt-4 border-t border-zinc-100">
            {nextStage && (
              <form action={moveOpportunityStage.bind(null, id, nextStage.id)}>
                <button className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-5 py-2.5 hover:bg-zinc-700 shadow-sm transition-colors">
                  Avançar para “{nextStage.name}” <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </button>
              </form>
            )}
            {lostStage && (
              <form action={moveOpportunityStage.bind(null, id, lostStage.id)}>
                <button className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-zinc-200 text-red-600 text-[13px] font-semibold px-4 py-2.5 hover:bg-red-50 hover:border-red-200 transition-colors">
                  <X className="h-3.5 w-3.5" strokeWidth={3} /> Marcar como perdido
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Timeline */}
        <div className="lg:col-span-2 space-y-4">
          <div className={card}>
            <div className={cardHeader}>Timeline</div>
            <form action={addNoteAction} className="px-5 py-4 border-b border-zinc-100 flex gap-2">
              <input name="text" placeholder="Adicionar nota…" required
                className="flex-1 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
              <button className="rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-5 hover:bg-zinc-700 transition-colors">Salvar</button>
            </form>
            <div className="divide-y divide-zinc-50">
              {acts.map((a) => {
                const payload = a.act.payload as { text?: string; to?: string };
                const isAI = a.act.actorType === "ai_agent";
                return (
                  <div key={a.act.id} className={`px-5 py-4 flex gap-3.5 ${isAI ? "bg-violet-50/40" : ""}`}>
                    <div className={`mt-0.5 h-7 w-7 shrink-0 rounded-lg flex items-center justify-center ${isAI ? "bg-violet-100 text-violet-600" : "bg-zinc-100 text-zinc-500"}`}>
                      {actIcon[a.act.type] ?? <StickyNote className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-zinc-400">
                        {isAI ? "Agente IA" : a.act.actorType === "system" ? "Sistema" : a.actorName} · {relTime(a.act.createdAt)}
                      </div>
                      <div className="text-[13px] text-zinc-700 mt-0.5 leading-relaxed">
                        {payload.text ?? (payload.to ? `Movido para "${payload.to}"` : a.act.type)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {showPresalesOrigin && sourceLead && (
            <div className={`${card} p-5`}>
              <div className="font-semibold text-sm text-zinc-800 mb-3 flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-zinc-400" /> Origem: pré-venda
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div className="rounded-xl bg-zinc-50 p-3">
                  <div className="text-zinc-400 mb-0.5">Canal</div>
                  <div className="text-zinc-800 font-semibold">{channelLabel(sourceLead.lead.channel)}</div>
                </div>
                <div className="rounded-xl bg-zinc-50 p-3">
                  <div className="text-zinc-400 mb-0.5">Classificação</div>
                  <div className="text-zinc-800 font-semibold">
                    {sourceLead.lead.classification ? CLASSIFICATION_LABELS[sourceLead.lead.classification] : "—"}
                  </div>
                </div>
              </div>
              <div className="text-xs text-zinc-500 space-y-1">
                <div>SDR responsável: <span className="text-zinc-800 font-medium">{sourceLead.sdrName ?? "—"}</span></div>
                {sourceLead.lead.city && (
                  <div>Local: <span className="text-zinc-800 font-medium">{sourceLead.lead.city}/{sourceLead.lead.state}</span></div>
                )}
                {sourceLead.lead.handedOffAt && (
                  <div>Handoff em: <span className="text-zinc-800 font-medium">{dateBR(sourceLead.lead.handedOffAt)}</span></div>
                )}
              </div>
              {sourceLead.lead.notes && (
                <div className="mt-3 rounded-xl border border-zinc-100 p-3 text-xs text-zinc-600 leading-relaxed">
                  {sourceLead.lead.notes}
                </div>
              )}
              <Link href={`/pre-vendas/${sourceLead.lead.id}`}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800">
                Ver histórico completo do lead <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}

          <div className={`${card} p-5`}>
            <div className="font-semibold text-sm text-zinc-800 mb-3 flex items-center gap-2">
              <User className="h-4 w-4 text-zinc-400" /> Contato principal
            </div>
            <div className="text-sm font-medium text-zinc-900">{row.contactName ?? "—"}</div>
            <div className="text-xs text-zinc-500 mt-0.5 tabular-nums">{row.contactPhone}</div>
            <div className="text-xs text-zinc-500">{row.contactEmail}</div>
            {row.contactPhone && can(user.role, "use_whatsapp") && (
              <form action={openWhatsappForOpportunity.bind(null, id)} className="mt-3">
                <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5 hover:bg-emerald-100 transition-colors">
                  <MessageCircle className="h-3.5 w-3.5" /> Conversar no WhatsApp
                </button>
              </form>
            )}
          </div>

          {showFinancials && (
            <div className={`${card} p-5`}>
              <div className="font-semibold text-sm text-zinc-800 mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-zinc-400" /> Propostas
              </div>
              {props.length === 0 && <p className="text-xs text-zinc-400 mb-3">Nenhuma proposta ainda.</p>}
              {props.map((p) => (
                <div key={p.id} className="rounded-xl border border-zinc-100 p-3.5 text-xs space-y-1.5 mb-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-zinc-800">
                      v{p.version} · {produtoLabel(p.productLine, p.productVariant, p.qty)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${
                      p.status === "accepted" ? "bg-emerald-50 text-emerald-600"
                      : p.status === "rejected" ? "bg-red-50 text-red-600"
                      : p.status === "sent" ? "bg-brand-50 text-brand-600"
                      : "bg-zinc-100 text-zinc-500"
                    }`}>
                      {p.status === "accepted" ? "Aceita" : p.status === "rejected" ? "Recusada" : p.status === "sent" ? "Enviada" : "Rascunho"}
                    </span>
                  </div>
                  {p.validityMonths && <div className="text-zinc-500">Validade: {p.validityMonths} meses</div>}
                  {p.unitPrice && <div className="text-zinc-500">Unitário: {brl(p.unitPrice)}</div>}
                  <div className="flex justify-between pt-1.5 border-t border-zinc-100">
                    <span className="text-zinc-500">{p.financingType === "financing" ? `Financiado ${p.installments}×` : "À vista"}</span>
                    <span className="font-bold text-zinc-900 tabular-nums">{brl(p.totalPrice)}</span>
                  </div>
                </div>
              ))}

              {opp.status === "open" && (
                <div className="mt-4 space-y-3">
                  <AiButton
                    action={propostaReferenciaAction}
                    label="Montar com preço de referência"
                    busyLabel="Montando proposta…"
                  />
                  <details className="rounded-xl border border-zinc-100">
                    <summary className="cursor-pointer px-3.5 py-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 flex items-center gap-1.5 rounded-xl">
                      <Plus className="h-3.5 w-3.5" /> Nova proposta manual
                    </summary>
                    <form action={createProposal} className="p-3.5 pt-1 space-y-2 text-xs">
                      <input type="hidden" name="opportunityId" value={id} />
                      <div className="grid grid-cols-2 gap-2">
                        <select name="productLine" required defaultValue={opp.productLine ?? ""}
                          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2">
                          <option value="" disabled>Produto *</option>
                          {PRODUTOS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select name="productVariant" defaultValue={opp.productVariant ?? ""}
                          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2">
                          <option value="">Mídia</option>
                          {VARIANTES.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input name="qty" required placeholder="Qtd. *" type="number" min="1" defaultValue={opp.productQty ?? 1}
                          className="rounded-lg border border-zinc-200 px-2.5 py-2" />
                        <input name="unitPrice" placeholder="Unitário R$" type="number" step="0.01" min="0"
                          className="rounded-lg border border-zinc-200 px-2.5 py-2" />
                        <select name="validityMonths" className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2">
                          <option value="">Validade</option>
                          <option value="12">12 meses</option>
                          <option value="18">18 meses</option>
                          <option value="24">24 meses</option>
                          <option value="36">36 meses</option>
                        </select>
                      </div>
                      <input name="totalPrice" required placeholder="Preço total R$ *" type="number" step="0.01" min="0"
                        className="w-full rounded-lg border border-zinc-200 px-2.5 py-2" />
                      <div className="grid grid-cols-2 gap-2">
                        <select name="financingType" className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2">
                          <option value="cash">À vista</option>
                          <option value="financing">Financiamento</option>
                          <option value="leasing">Leasing</option>
                        </select>
                        <input name="installments" placeholder="Parcelas" type="number" min="1" className="rounded-lg border border-zinc-200 px-2.5 py-2" />
                      </div>
                      <button className="w-full rounded-lg bg-zinc-900 text-white font-semibold py-2 hover:bg-zinc-700 transition-colors">
                        Criar proposta
                      </button>
                    </form>
                  </details>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
