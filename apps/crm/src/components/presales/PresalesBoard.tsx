"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import { PresalesCard } from "./PresalesCard";
import { PresalesColumnHeader } from "./PresalesColumnHeader";
import type { BoardColumn, BoardLead, CloserOption } from "./types";
import {
  stageLabel,
  validateTransition,
  type LeadForValidation,
  type PresalesStage,
  type PresalesStatus,
} from "@/lib/presalesFunnel";

export type ActionResult = { ok: boolean; error?: string; missing?: string[] };

type Dialog =
  | { kind: "missing"; lead: BoardLead; toStatus: PresalesStatus; missing: string[] }
  | { kind: "move"; lead: BoardLead }
  | { kind: "schedule"; lead: BoardLead }
  | { kind: "handoff"; lead: BoardLead }
  | { kind: "discard"; lead: BoardLead }
  | { kind: "newStage" }
  | null;

/** Espelha no cliente a mesma regra que o servidor aplica, para dar resposta imediata. */
function toValidationShape(lead: BoardLead): LeadForValidation {
  return {
    attemptCount: lead.attemptCount,
    lastContactAt: lead.hasContact ? new Date() : null,
    productLine: lead.produtoText,
    state: lead.state,
    billFileUrl: lead.hasBill ? "ok" : null,
    billReceivedAt: null,
    lostReason: lead.lostReason,
  };
}

export function PresalesBoard({
  columns,
  closers,
  moveAction,
  handoffAction,
  scheduleAction,
  discardAction,
  whatsappAction,
  createStageAction,
}: {
  columns: BoardColumn[];
  closers: CloserOption[];
  moveAction: (leadId: string, toStatus: string) => Promise<ActionResult>;
  handoffAction: (leadId: string, closerId: string) => Promise<ActionResult>;
  scheduleAction: (leadId: string, formData: FormData) => Promise<ActionResult>;
  discardAction: (leadId: string, reason: string) => Promise<ActionResult>;
  whatsappAction: (leadId: string) => Promise<void>;
  createStageAction?: (label: string) => Promise<ActionResult>;
}) {
  // O estado local existe para o arraste responder na hora; quando o servidor
  // revalida (após mover, entregar, descartar), reabsorve os dados novos —
  // senão os totais e a taxa de conversão do cabeçalho ficariam defasados.
  const [cols, setCols] = useState(columns);
  useEffect(() => setCols(columns), [columns]);

  // Espelha as colunas atuais (fixas + personalizadas) como "etapas" para o
  // validador do cliente — assim uma coluna criada agora mesmo já funciona
  // no arraste sem precisar conhecer a lista fixa do funil.
  const stagesForClient: PresalesStage[] = useMemo(
    () =>
      cols.map((c) => ({
        id: c.id,
        label: c.label,
        shortLabel: c.shortLabel,
        slaDays: c.slaDays,
        terminal: c.terminal,
        isLost: c.isLost,
        requires: c.requires,
      })),
    [cols]
  );

  const [dragging, setDragging] = useState<BoardLead | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function moveLocally(leadId: string, toStatus: string) {
    setCols((prev) => {
      const from = prev.find((c) => c.leads.some((l) => l.id === leadId));
      if (!from || from.id === toStatus) return prev;
      const lead = from.leads.find((l) => l.id === leadId)!;
      return prev.map((c) => {
        if (c.id === from.id) return { ...c, leads: c.leads.filter((l) => l.id !== leadId), count: c.count - 1 };
        if (c.id === toStatus) {
          return {
            ...c,
            leads: [{ ...lead, status: toStatus as PresalesStatus, daysInStage: 0, sla: "ok" as const }, ...c.leads],
            count: c.count + 1,
          };
        }
        return c;
      });
    });
  }

  /** Roda a ação no servidor; se ela recusar, desfaz o movimento otimista. */
  function runMove(lead: BoardLead, toStatus: string, previousStatus: string) {
    startTransition(async () => {
      const result = await moveAction(lead.id, toStatus);
      if (!result.ok) {
        moveLocally(lead.id, previousStatus);
        if (result.missing?.length) {
          setDialog({ kind: "missing", lead, toStatus: toStatus as PresalesStatus, missing: result.missing });
        } else {
          setToast({ tone: "error", text: result.error ?? "Não foi possível mover o lead." });
        }
      }
    });
  }

  function attemptMove(lead: BoardLead, toStatus: string) {
    if (lead.status === toStatus) return;
    setToast(null);

    // Converter não é arrastar: exige criar a oportunidade no funil de vendas.
    if (toStatus === "convertido") {
      setToast({
        tone: "error",
        text: "Para converter, abra o lead e use “Aceitar e criar oportunidade”.",
      });
      return;
    }

    const check = validateTransition(toValidationShape(lead), lead.status, toStatus, stagesForClient);

    // Incompatível exige motivo — pede no diálogo em vez de recusar seco.
    if (toStatus === "incompativel") {
      setDialog({ kind: "discard", lead });
      return;
    }
    // Passagem de bastão: precisa escolher o vendedor de fechamento.
    if (toStatus === "aguardando_vendedor") {
      if (!check.ok) {
        setDialog({ kind: "missing", lead, toStatus, missing: check.missing });
        return;
      }
      setDialog({ kind: "handoff", lead });
      return;
    }
    if (!check.ok) {
      setDialog({ kind: "missing", lead, toStatus: toStatus as PresalesStatus, missing: check.missing });
      return;
    }

    moveLocally(lead.id, toStatus);
    runMove(lead, toStatus, lead.status);
  }

  function onDrop(toStatus: string) {
    const lead = dragging;
    setDragging(null);
    setHoverCol(null);
    if (lead) attemptMove(lead, toStatus);
  }

  const totalLeads = cols.reduce((n, c) => n + c.count, 0);

  return (
    <div className="relative">
      {toast && (
        <div
          role="status"
          className={`mb-3 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] ${
            toast.tone === "error"
              ? "bg-red-50 border-red-100 text-red-700"
              : "bg-emerald-50 border-emerald-100 text-emerald-700"
          }`}
        >
          {toast.tone === "error" ? <AlertTriangle className="h-4 w-4 mt-px shrink-0" /> : <CheckCircle2 className="h-4 w-4 mt-px shrink-0" />}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Fechar aviso" className="text-current/60 hover:text-current">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {pending && (
        <div className="absolute -top-7 right-0 inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
          <Loader2 className="h-3 w-3 animate-spin" /> salvando…
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4 items-start">
        {cols.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setHoverCol(col.id);
            }}
            onDragLeave={() => setHoverCol((h) => (h === col.id ? null : h))}
            onDrop={() => onDrop(col.id)}
            className={`w-[272px] shrink-0 rounded-2xl border transition-colors ${
              hoverCol === col.id && dragging && dragging.status !== col.id
                ? col.id === "convertido"
                  ? "bg-zinc-100 border-zinc-300"
                  : "bg-brand-50/60 border-brand-200"
                : "bg-zinc-50/80 border-zinc-100"
            }`}
          >
            <PresalesColumnHeader column={col} />
            <div className="p-2 space-y-2 min-h-20">
              {col.leads.map((lead) => (
                <PresalesCard
                  key={lead.id}
                  lead={lead}
                  onDragStart={() => setDragging(lead)}
                  onQuickMove={(l) => setDialog({ kind: "move", lead: l })}
                  onSchedule={(l) => setDialog({ kind: "schedule", lead: l })}
                  onWhatsapp={(l) => startTransition(() => whatsappAction(l.id))}
                />
              ))}
              {col.leads.length === 0 && (
                <p className="px-2 py-6 text-center text-[11.5px] text-zinc-400">
                  {col.id === "convertido"
                    ? "Leads chegam aqui ao virar oportunidade."
                    : col.terminal
                    ? "Nenhum lead aqui."
                    : "Arraste um lead para cá."}
                </p>
              )}
            </div>
          </div>
        ))}

        {createStageAction && (
          <button
            type="button"
            onClick={() => setDialog({ kind: "newStage" })}
            className="w-[220px] shrink-0 self-stretch min-h-24 rounded-2xl border-2 border-dashed border-zinc-200 text-zinc-400 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/40 transition-colors flex flex-col items-center justify-center gap-1.5 py-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <Plus className="h-4.5 w-4.5" />
            <span className="text-[12.5px] font-semibold">Nova coluna</span>
          </button>
        )}
      </div>

      {totalLeads === 0 && (
        <div className="rounded-2xl bg-white border border-zinc-100 p-10 text-center">
          <p className="font-semibold text-zinc-800">Nenhum lead encontrado</p>
          <p className="text-sm text-zinc-500 mt-1">Ajuste os filtros ou cadastre um novo lead de pré-venda.</p>
        </div>
      )}

      {/* ─── Diálogos ─────────────────────────────────────────────────────── */}

      {dialog?.kind === "missing" && (
        <Modal
          title="Faltam dados para avançar"
          onClose={() => setDialog(null)}
        >
          <p className="text-[13px] text-zinc-600">
            Para mover <b>{dialog.lead.name}</b> para <b>{stageLabel(dialog.toStatus, stagesForClient)}</b>, complete:
          </p>
          <ul className="mt-3 space-y-1.5">
            {dialog.missing.map((m) => (
              <li key={m} className="flex items-start gap-2 text-[13px] text-zinc-700">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-brand-500" />
                {m}
              </li>
            ))}
          </ul>
          <Link
            href={`/pre-vendas/${dialog.lead.id}`}
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-4 py-2.5 hover:bg-zinc-700 transition-colors"
          >
            Completar dados do lead <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Modal>
      )}

      {dialog?.kind === "move" && (
        <Modal title={`Mover ${dialog.lead.name}`} onClose={() => setDialog(null)}>
          <p className="text-[13px] text-zinc-500 mb-3">
            Etapa atual: <b className="text-zinc-700">{stageLabel(dialog.lead.status)}</b>
          </p>
          <div className="space-y-1.5">
            {cols.filter((st) => st.id !== dialog.lead.status && st.id !== "convertido").map((st) => {
              const check = validateTransition(toValidationShape(dialog.lead), dialog.lead.status, st.id, stagesForClient);
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    const lead = dialog.lead;
                    setDialog(null);
                    attemptMove(lead, st.id);
                  }}
                  className="w-full flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-left text-[13px] font-medium text-zinc-700 hover:border-brand-300 hover:bg-brand-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 transition-colors"
                >
                  <span>{st.label}</span>
                  {!check.ok && (
                    <span className="shrink-0 text-[10px] font-semibold text-brand-600">
                      faltam {check.missing.length} dado{check.missing.length > 1 ? "s" : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {dialog?.kind === "handoff" && (
        <Modal title="Passagem de bastão" onClose={() => setDialog(null)}>
          <p className="text-[13px] text-zinc-600">
            <b>{dialog.lead.name}</b> está qualificado. Escolha o vendedor que vai assumir o fechamento — a
            entrega e a comissão do SDR ficam registradas.
          </p>
          <form
            action={(formData) => {
              const lead = dialog.lead;
              const closerId = String(formData.get("closerId") ?? "");
              setDialog(null);
              moveLocally(lead.id, "aguardando_vendedor");
              startTransition(async () => {
                const result = await handoffAction(lead.id, closerId);
                if (!result.ok) {
                  moveLocally(lead.id, lead.status);
                  setToast({ tone: "error", text: result.error ?? "Não foi possível registrar a passagem." });
                } else {
                  setToast({ tone: "ok", text: `Lead entregue para fechamento.` });
                }
              });
            }}
            className="mt-4 space-y-3"
          >
            <div>
              <label htmlFor="closerId" className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                Vendedor de fechamento
              </label>
              <select
                id="closerId"
                name="closerId"
                required
                defaultValue=""
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              >
                <option value="" disabled>Selecione…</option>
                {closers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {dialog.lead.estimatedValueText && (
              <p className="text-[12px] text-zinc-500">
                Valor estimado da proposta: <b className="text-emerald-700">{dialog.lead.estimatedValueText}</b>
                {dialog.lead.produtoText && ` · ${dialog.lead.produtoText}`}
              </p>
            )}
            <button className="w-full rounded-xl bg-emerald-600 text-white text-[13px] font-bold px-4 py-2.5 hover:bg-emerald-500 transition-colors">
              Registrar passagem de bastão
            </button>
          </form>
        </Modal>
      )}

      {dialog?.kind === "discard" && (
        <Modal title="Marcar como incompatível" onClose={() => setDialog(null)}>
          <p className="text-[13px] text-zinc-600">
            Por que <b>{dialog.lead.name}</b> não segue? O motivo fica no histórico do lead.
          </p>
          <form
            action={(formData) => {
              const lead = dialog.lead;
              const reason = String(formData.get("reason") ?? "");
              setDialog(null);
              moveLocally(lead.id, "incompativel");
              startTransition(async () => {
                const result = await discardAction(lead.id, reason);
                if (!result.ok) {
                  moveLocally(lead.id, lead.status);
                  setToast({ tone: "error", text: result.error ?? "Não foi possível descartar o lead." });
                }
              });
            }}
            className="mt-4 space-y-3"
          >
            <textarea
              name="reason"
              required
              rows={3}
              placeholder="Ex.: mudou de cidade, comprou em outra loja, não retornou contato…"
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <button className="w-full rounded-xl bg-zinc-900 text-white text-[13px] font-bold px-4 py-2.5 hover:bg-zinc-700 transition-colors">
              Marcar como incompatível
            </button>
          </form>
        </Modal>
      )}

      {dialog?.kind === "newStage" && createStageAction && (
        <Modal title="Nova coluna no quadro" onClose={() => setDialog(null)}>
          <p className="text-[13px] text-zinc-500 mb-3">
            Cria uma coluna extra antes de “Aguardando vendedor”, sem SLA nem dado obrigatório — útil para
            organizar leads de um jeito próprio do time.
          </p>
          <form
            action={(formData) => {
              const name = String(formData.get("label") ?? "").trim();
              if (!name) return;
              setDialog(null);
              startTransition(async () => {
                const result = await createStageAction(name);
                setToast(
                  result.ok
                    ? { tone: "ok", text: `Coluna “${name}” criada.` }
                    : { tone: "error", text: result.error ?? "Não foi possível criar a coluna." }
                );
              });
            }}
            className="space-y-3"
          >
            <div>
              <label htmlFor="new-stage-label" className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                Nome da coluna
              </label>
              <input
                id="new-stage-label"
                name="label"
                required
                maxLength={40}
                autoFocus
                placeholder="Ex.: Aguardando visita técnica"
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <button className="w-full rounded-xl bg-zinc-900 text-white text-[13px] font-bold px-4 py-2.5 hover:bg-zinc-700 transition-colors">
              Criar coluna
            </button>
          </form>
        </Modal>
      )}

      {dialog?.kind === "schedule" && (
        <Modal title={`Agendar contato — ${dialog.lead.name}`} onClose={() => setDialog(null)}>
          <form
            action={(formData) => {
              const lead = dialog.lead;
              setDialog(null);
              startTransition(async () => {
                const result = await scheduleAction(lead.id, formData);
                setToast(
                  result.ok
                    ? { tone: "ok", text: "Tarefa agendada." }
                    : { tone: "error", text: result.error ?? "Não foi possível agendar." }
                );
              });
            }}
            className="space-y-3"
          >
            <div>
              <label htmlFor="task-title" className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                O que fazer
              </label>
              <input
                id="task-title"
                name="title"
                defaultValue={`Ligar para ${dialog.lead.name}`}
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="task-type" className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                  Tipo
                </label>
                <select id="task-type" name="type" defaultValue="call" className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm">
                  <option value="call">Ligação</option>
                  <option value="meeting">Reunião</option>
                  <option value="todo">Tarefa</option>
                </select>
              </div>
              <div>
                <label htmlFor="task-due" className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">
                  Quando
                </label>
                <input id="task-due" type="date" name="dueAt" className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm" />
              </div>
            </div>
            <button className="w-full rounded-xl bg-zinc-900 text-white text-[13px] font-bold px-4 py-2.5 hover:bg-zinc-700 transition-colors">
              Agendar
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/30"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-zinc-100 p-5 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-[15px] font-bold text-zinc-900 leading-snug">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 text-zinc-400 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
