import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Flame, Gauge, MessageCircle, Phone, Plug,
  Snowflake, StickyNote, Sun, Target, User,
} from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import {
  openWhatsappForPresalesLead, promoteToOpportunity, registerContactAttempt,
  setLeadClassification, updateLeadQualification,
} from "@/app/actions-presales";
import { brl, brlCents, dateBR, daysSince, relTime } from "@/lib/format";
import { channelLabel, CLASSIFICATION_LABELS, visitReasonLabel } from "@/lib/presalesChannels";
import { buildStages, customStagesFromSettings, slaState, stageIndex, stageLabel, validateTransition } from "@/lib/presalesFunnel";
import { estimateValor } from "@/lib/presalesEstimate";
import { carregarTabelaPrecos, produtoLabel, VARIANTES, PRODUTOS } from "@/lib/produtos";

export default async function PresalesLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user.role, "view_presales")) redirect("/conta/senha");

  const [lead] = await db.select().from(s.presalesLeads)
    .where(and(eq(s.presalesLeads.id, id), eq(s.presalesLeads.workspaceId, user.workspaceId)));
  if (!lead) notFound();

  const [acts, workspace, handoffs, leadTasks, owner] = await Promise.all([
    db.select({ act: s.activities, actorName: s.users.name }).from(s.activities)
      .leftJoin(s.users, eq(s.users.id, s.activities.actorId))
      .where(and(eq(s.activities.relatedToType, "presales_lead"), eq(s.activities.relatedToId, id)))
      .orderBy(desc(s.activities.createdAt)),
    db.select().from(s.workspaces).where(eq(s.workspaces.id, user.workspaceId)).then((r) => r[0] ?? null),
    db.select({ handoff: s.presalesHandoffs, closerName: s.users.name }).from(s.presalesHandoffs)
      .leftJoin(s.users, eq(s.users.id, s.presalesHandoffs.closerId))
      .where(eq(s.presalesHandoffs.leadId, id))
      .orderBy(desc(s.presalesHandoffs.createdAt)),
    db.select().from(s.tasks)
      .where(and(eq(s.tasks.relatedToType, "presales_lead"), eq(s.tasks.relatedToId, id)))
      .orderBy(s.tasks.dueAt),
    lead.ownerId
      ? db.select().from(s.users).where(eq(s.users.id, lead.ownerId)).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  const estimate = estimateValor(lead, await carregarTabelaPrecos(lead.workspaceId));
  const stages = buildStages(customStagesFromSettings(workspace?.settings));
  const sla = slaState(lead.status, lead.stageEnteredAt, stages);
  const currentStage = stages.find((st) => st.id === lead.status);
  const currentIdx = stageIndex(lead.status, stages);
  const nextStage = stages[currentIdx + 1];
  const check = nextStage
    ? validateTransition(lead, lead.status, nextStage.id, stages)
    : { ok: false, missing: [] as string[] };
  const pathStages = stages.filter((st) => !st.isLost);

  const card = "rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)]";
  const cardHeader = "px-5 py-4 border-b border-zinc-100 flex items-center gap-2 font-semibold text-sm text-zinc-800";
  const input = "w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
  const label = "block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-1";

  const classIcon: Record<string, React.ReactNode> = {
    quente: <Flame className="h-3.5 w-3.5" />,
    morno: <Sun className="h-3.5 w-3.5" />,
    frio: <Snowflake className="h-3.5 w-3.5" />,
  };

  async function classifyAction(classification: "quente" | "morno" | "frio") {
    "use server";
    await setLeadClassification(id, classification);
  }
  async function qualifyAction(formData: FormData) {
    "use server";
    await updateLeadQualification(id, formData);
  }
  async function contactAction(formData: FormData) {
    "use server";
    await registerContactAttempt(id, String(formData.get("note") ?? ""));
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <Link href="/pre-vendas" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-800 mb-4 transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao funil
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">{lead.name}</h1>
            <span className="rounded-full bg-brand-100 text-brand-700 text-xs font-semibold px-3 py-1">
              {stageLabel(lead.status, stages)}
            </span>
            {sla === "atrasado" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold px-3 py-1">
                <AlertTriangle className="h-3 w-3" /> Fora do SLA
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500 mt-1.5">
            {channelLabel(lead.channel)}{lead.socialNetwork ? ` · ${lead.socialNetwork}` : ""} · {lead.phone}
            {owner ? ` · SDR: ${owner.name}` : ""}
          </p>
          {lead.lostReason && (
            <p className="text-sm text-red-600 mt-1">Motivo da perda: {lead.lostReason}</p>
          )}
        </div>

        {estimate && (
          <div className="text-right shrink-0">
            <div className="text-[26px] font-bold text-emerald-700 tabular-nums tracking-tight">{brl(estimate.value)}</div>
            <div className="text-sm text-zinc-500">
              {produtoLabel(lead.productLine, lead.productVariant, estimate.qtd)} · {brl(estimate.unitPrice)} cada
            </div>
          </div>
        )}
      </div>

      {/* Caminho do funil + próxima ação */}
      <div className={`${card} p-5 mb-5`}>
        <div className="flex items-center gap-0">
          {pathStages.map((st, i) => {
            const done = currentIdx > stageIndex(st.id, stages);
            const current = st.id === lead.status;
            return (
              <div key={st.id} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5 min-w-0">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    done ? "bg-emerald-500 text-white"
                    : current ? "bg-brand-500 text-white ring-4 ring-brand-100"
                    : "bg-zinc-100 text-zinc-400"
                  }`}>
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className={`text-[10px] font-medium text-center leading-tight ${current ? "text-brand-700" : done ? "text-emerald-700" : "text-zinc-400"}`}>
                    {st.shortLabel}
                  </span>
                </div>
                {i < pathStages.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-2 mb-5 rounded ${done ? "bg-emerald-400" : "bg-zinc-100"}`} />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 pt-4 border-t border-zinc-100 flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-zinc-500">
            {daysSince(lead.stageEnteredAt)}d nesta etapa
            {currentStage?.slaDays != null ? ` (SLA ${currentStage.slaDays}d)` : ""}
            {lead.lastContactAt ? ` · último contato ${relTime(lead.lastContactAt)}` : " · nunca contatado"}
            {lead.attemptCount > 0 ? ` · ${lead.attemptCount} tentativa(s)` : ""}
          </span>

          {lead.status === "aguardando_vendedor" && can(user.role, "manage_records") ? (
            <form action={promoteToOpportunity.bind(null, id)} className="ml-auto">
              <button className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white text-[13px] font-bold px-5 py-2.5 hover:bg-emerald-500 shadow-sm transition-colors">
                Aceitar e criar oportunidade <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          ) : lead.convertedOpportunityId ? (
            <Link
              href={`/oportunidades/${lead.convertedOpportunityId}`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-[13px] font-semibold px-4 py-2.5 hover:bg-emerald-100 transition-colors"
            >
              <Target className="h-3.5 w-3.5" /> Ver oportunidade
            </Link>
          ) : nextStage && !currentStage?.terminal ? (
            check.ok ? (
              <Link
                href="/pre-vendas"
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-4 py-2.5 hover:bg-zinc-700 transition-colors"
              >
                Pronto para “{nextStage.shortLabel}” — mover no funil <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <div className="ml-auto rounded-xl bg-brand-50 border border-brand-100 px-3.5 py-2.5">
                <div className="text-[11px] font-bold text-brand-700 uppercase tracking-wide mb-1">
                  Para ir a “{nextStage.shortLabel}” falta
                </div>
                <ul className="text-[12px] text-brand-800 space-y-0.5">
                  {check.missing.map((m) => <li key={m}>· {m}</li>)}
                </ul>
              </div>
            )
          ) : null}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Qualificação */}
          <div className={card}>
            <div className={cardHeader}>
              <Gauge className="h-4 w-4 text-zinc-400" /> Dados de qualificação
            </div>
            <form action={qualifyAction} className="p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="pontoAtendimento">Ponto de atendimento</label>
                  <input id="pontoAtendimento" name="pontoAtendimento" list="distribuidoras"
                    defaultValue={lead.pontoAtendimento ?? ""} placeholder="Lovet Matriz" className={input} />
                  <datalist id="distribuidoras">
                    <option value="Lovet Matriz" /><option value="Lovet Filial" />
                    <option value="Loja online" />
                  </datalist>
                </div>
                <div>
                  <label className={label} htmlFor="state">UF *</label>
                  <input id="state" name="state" maxLength={2} defaultValue={lead.state ?? "SC"} className={input} />
                </div>
              </div>

              <div>
                <label className={label} htmlFor="city">Cidade</label>
                <input id="city" name="city" defaultValue={lead.city ?? ""} placeholder="Florianópolis" className={input} />
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className={label} htmlFor="productLine">Produto *</label>
                  <select id="productLine" name="productLine" defaultValue={lead.productLine ?? ""} className={input}>
                    <option value="" disabled>Selecione</option>
                    {PRODUTOS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="productVariant">Mídia</label>
                  <select id="productVariant" name="productVariant" defaultValue={lead.productVariant ?? ""} className={input}>
                    <option value="">—</option>
                    {VARIANTES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="productQty">Qtd.</label>
                  <input id="productQty" name="productQty" type="number" min="1"
                    defaultValue={lead.productQty ?? 1} className={input} />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={label} htmlFor="billFileUrl">Link dos documentos (CNPJ/contrato social) *</label>
                  <input id="billFileUrl" name="billFileUrl" type="url" defaultValue={lead.billFileUrl ?? ""}
                    placeholder="https://drive.google.com/…" className={input} />
                  <label className="mt-2 flex items-center gap-2 text-[13px] text-zinc-600">
                    <input type="checkbox" name="billReceived" defaultChecked={lead.billReceivedAt != null}
                      className="rounded border-zinc-300" />
                    Documentos recebidos (por WhatsApp, e-mail ou presencialmente)
                  </label>
                  {lead.billReceivedAt && (
                    <p className="mt-1 text-[11px] text-zinc-400">Registrada em {dateBR(lead.billReceivedAt)}</p>
                  )}
                </div>
                <div>
                  <label className={label} htmlFor="prescriptionDate">Data prevista de recompra *</label>
                  <input id="prescriptionDate" name="prescriptionDate" type="date"
                    defaultValue={lead.prescriptionDate ? new Date(lead.prescriptionDate).toISOString().slice(0, 10) : ""}
                    className={input} />
                  <p className="mt-1 text-[11px] text-zinc-400">Quando o cliente deve voltar a comprar — é o gatilho da recompra.</p>
                </div>
              </div>
              <p className="text-[11px] text-brand-700 bg-brand-50 rounded-lg px-3 py-2">
                Preencher os documentos (link ou vencimento) qualifica o lead automaticamente assim que os demais dados exigidos estiverem completos.
              </p>

              <button className="w-full rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-6 py-2.5 hover:bg-zinc-700 shadow-sm transition-colors">
                Salvar qualificação
              </button>
              <p className="text-[11px] text-zinc-400">
                * exigidos para entregar o lead ao vendedor. A estimativa usa a quantidade de itens e a UF.
              </p>
            </form>
          </div>

          {/* Histórico */}
          <div className={card}>
            <div className={cardHeader}>Histórico</div>
            <form action={contactAction} className="px-5 py-4 border-b border-zinc-100 flex gap-2">
              <input name="note" placeholder="Registrar tentativa de contato…" className={`${input} flex-1`} />
              <button className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-brand-500 text-white text-[13px] font-semibold px-4 hover:bg-brand-600 transition-colors">
                <Phone className="h-3.5 w-3.5" /> Registrar
              </button>
            </form>
            <div className="divide-y divide-zinc-50 max-h-[420px] overflow-y-auto">
              {acts.map((a) => {
                const payload = a.act.payload as { text?: string; to?: string };
                return (
                  <div key={a.act.id} className="px-5 py-3.5 flex gap-3.5">
                    <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg flex items-center justify-center bg-zinc-100 text-zinc-500">
                      {a.act.type === "call_logged" ? <Phone className="h-3.5 w-3.5" />
                        : a.act.type === "presales_handoff" ? <ArrowRight className="h-3.5 w-3.5" />
                        : a.act.type === "presales_status_changed" ? <Target className="h-3.5 w-3.5" />
                        : <StickyNote className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-zinc-400">
                        {a.act.actorType === "system" ? "Sistema" : a.actorName ?? "—"} · {relTime(a.act.createdAt)}
                      </div>
                      <div className="text-[13px] text-zinc-700 mt-0.5 leading-relaxed">
                        {payload.text ?? (payload.to ? `Movido para “${stageLabel(payload.to, stages)}”` : a.act.type)}
                      </div>
                    </div>
                  </div>
                );
              })}
              {acts.length === 0 && <div className="px-5 py-6 text-sm text-zinc-400 text-center">Sem atividades ainda.</div>}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className={`${card} p-5`}>
            <div className="font-semibold text-sm text-zinc-800 mb-3 flex items-center gap-2">
              <User className="h-4 w-4 text-zinc-400" /> Contato
            </div>
            <div className="text-sm font-medium text-zinc-900">{lead.name}</div>
            <div className="text-xs text-zinc-500 mt-0.5 tabular-nums">{lead.phone}</div>
            {lead.email && <div className="text-xs text-zinc-500">{lead.email}</div>}
            {lead.notes && <p className="text-xs text-zinc-600 mt-2 leading-relaxed">{lead.notes}</p>}
            {can(user.role, "use_whatsapp") && (
              <form action={openWhatsappForPresalesLead.bind(null, id)} className="mt-3">
                <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5 hover:bg-emerald-100 transition-colors">
                  <MessageCircle className="h-3.5 w-3.5" /> Conversar no WhatsApp
                </button>
              </form>
            )}
          </div>

          <div className={`${card} p-5`}>
            <div className="font-semibold text-sm text-zinc-800 mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-zinc-400" /> Classificação
            </div>
            <div className="flex gap-2">
              {(["quente", "morno", "frio"] as const).map((c) => (
                <form key={c} action={classifyAction.bind(null, c)}>
                  <button className={`inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold px-3 py-2 transition-colors ${
                    lead.classification === c ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}>
                    {classIcon[c]} {CLASSIFICATION_LABELS[c]}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <div className={`${card} p-5`}>
            <div className="font-semibold text-sm text-zinc-800 mb-3 flex items-center gap-2">
              <Plug className="h-4 w-4 text-zinc-400" /> Perfil do cliente
            </div>
            <dl className="text-xs space-y-2">
              <Row term="Produto" desc={produtoLabel(lead.productLine, lead.productVariant, lead.productQty) ?? "—"} />
              <Row term="Local" desc={lead.city ? `${lead.city}/${lead.state ?? ""}` : lead.state ?? "—"} />
              <Row term="Motivo do contato" desc={visitReasonLabel(lead.visitReason) ?? "—"} />
              <Row term="Recompra prevista" desc={lead.prescriptionDate ? dateBR(lead.prescriptionDate) : "—"} />
              <Row term="Custo do lead" desc={lead.costPerLead ? brlCents(lead.costPerLead) : "—"} />
              {estimate && <Row term="Proposta estimada" desc={brl(estimate.value)} strong />}
            </dl>
            {lead.billFileUrl && (
              <a href={lead.billFileUrl} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 transition-colors">
                Abrir documentos anexados
              </a>
            )}
          </div>

          {handoffs.length > 0 && (
            <div className={`${card} p-5`}>
              <div className="font-semibold text-sm text-zinc-800 mb-3 flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-zinc-400" /> Passagem de bastão
              </div>
              {handoffs.map(({ handoff, closerName }) => (
                <div key={handoff.id} className="text-xs space-y-1.5 border-b border-zinc-50 last:border-0 pb-3 last:pb-0 mb-3 last:mb-0">
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-400">Entregue a</span>
                    <span className="font-semibold text-zinc-800">{closerName ?? "—"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-400">Comissão do SDR</span>
                    <span className="font-semibold text-emerald-700 tabular-nums">{brl(handoff.commissionAmount)}</span>
                  </div>
                  {handoff.estimatedValue && (
                    <div className="flex justify-between gap-3">
                      <span className="text-zinc-400">Estimativa na entrega</span>
                      <span className="font-semibold text-zinc-800 tabular-nums">{brl(handoff.estimatedValue)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-400">Situação</span>
                    <span className={`font-semibold ${handoff.status === "accepted" ? "text-emerald-700" : "text-brand-700"}`}>
                      {handoff.status === "accepted" ? "Aceito pelo vendedor" : handoff.status === "returned" ? "Devolvido" : "Aguardando aceite"}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400">{relTime(handoff.createdAt)}</div>
                </div>
              ))}
            </div>
          )}

          {leadTasks.length > 0 && (
            <div className={`${card} p-5`}>
              <div className="font-semibold text-sm text-zinc-800 mb-3">Tarefas agendadas</div>
              <ul className="space-y-2">
                {leadTasks.map((t) => (
                  <li key={t.id} className="text-xs flex items-start justify-between gap-2">
                    <span className={t.completedAt ? "text-zinc-400 line-through" : "text-zinc-700"}>{t.title}</span>
                    {t.dueAt && <span className="shrink-0 text-zinc-400 tabular-nums">{dateBR(t.dueAt)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ term, desc, strong }: { term: string; desc: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-zinc-400 shrink-0">{term}</dt>
      <dd className={`text-right ${strong ? "font-bold text-emerald-700" : "font-semibold text-zinc-800"}`}>{desc}</dd>
    </div>
  );
}
