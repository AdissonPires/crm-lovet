"use client";

import Link from "next/link";
import { AlertTriangle, BadgeCheck, CalendarPlus, ChevronRight, MapPin, MessageCircle, Phone } from "lucide-react";
import type { BoardLead } from "./types";
import { CLASSIFICATION_LABELS } from "@/lib/presalesChannels";

const classTone: Record<string, string> = {
  quente: "bg-red-50 text-red-700 border-red-100",
  morno: "bg-brand-50 text-brand-700 border-brand-100",
  frio: "bg-sky-50 text-sky-700 border-sky-100",
};

const channelTone: Record<string, string> = {
  meta_ads: "bg-blue-50 text-blue-700 border-blue-100",
  google_ads: "bg-emerald-50 text-emerald-700 border-emerald-100",
  social_organic: "bg-violet-50 text-violet-700 border-violet-100",
  indicacao: "bg-teal-50 text-teal-700 border-teal-100",
  prospeccao: "bg-brand-50 text-brand-700 border-brand-100",
  whatsapp: "bg-green-50 text-green-700 border-green-100",
  outro: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

/** Rótulo curto da origem para caber no card. */
const channelShort: Record<string, string> = {
  meta_ads: "Meta", google_ads: "Google", social_organic: "Social",
  indicacao: "Indicação", prospeccao: "Prospecção", whatsapp: "WhatsApp", outro: "Outro",
};

export function PresalesCard({
  lead,
  onDragStart,
  onQuickMove,
  onSchedule,
  onWhatsapp,
}: {
  lead: BoardLead;
  onDragStart: () => void;
  onQuickMove: (lead: BoardLead) => void;
  onSchedule: (lead: BoardLead) => void;
  onWhatsapp: (lead: BoardLead) => void;
}) {
  const late = lead.sla === "atrasado";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`group rounded-xl bg-white border p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${
        late ? "border-red-200 ring-1 ring-red-100" : "border-zinc-100"
      }`}
    >
      {/* Nome + classificação */}
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/pre-vendas/${lead.id}`}
          draggable={false}
          className="text-[13px] font-semibold text-zinc-900 leading-snug hover:text-brand-700 transition-colors"
        >
          {lead.name}
        </Link>
        {lead.classification && (
          <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wide rounded-md border px-1.5 py-0.5 ${classTone[lead.classification]}`}>
            {CLASSIFICATION_LABELS[lead.classification]}
          </span>
        )}
      </div>

      {lead.city && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-500">
          <MapPin className="h-3 w-3 shrink-0 text-zinc-400" />
          <span className="truncate">
            {lead.city}{lead.state ? `/${lead.state}` : ""}
          </span>
        </div>
      )}

      {/* O que o lead quer */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lead.produtoText ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-md bg-brand-50 text-brand-700 border border-brand-100 px-1.5 py-0.5">
            <BadgeCheck className="h-2.5 w-2.5" />
            {lead.produtoText}
          </span>
        ) : (
          <span className="text-[10px] font-medium rounded-md bg-zinc-100 text-zinc-500 border border-zinc-200 px-1.5 py-0.5">
            produto não definido
          </span>
        )}
      </div>

      {lead.estimatedValueText && (
        <div className="mt-1.5 text-xs font-bold text-emerald-700 tabular-nums">
          ~{lead.estimatedValueText}
        </div>
      )}

      {/* Origem + SDR + SLA */}
      <div className="mt-2.5 pt-2.5 border-t border-zinc-50 flex items-center justify-between gap-2">
        <span className={`text-[9px] font-semibold rounded-md border px-1.5 py-0.5 ${channelTone[lead.channel] ?? channelTone.outro}`}>
          {channelShort[lead.channel] ?? lead.channel}
        </span>

        <div className="flex items-center gap-1.5">
          <span
            title={
              lead.daysSinceContact == null
                ? "Nunca contatado"
                : `Último contato há ${lead.daysSinceContact}d · ${lead.daysInStage}d na etapa`
            }
            className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${
              late ? "text-red-600" : "text-zinc-400"
            }`}
          >
            {late && <AlertTriangle className="h-2.5 w-2.5" />}
            {lead.daysSinceContact == null ? "sem contato" : `${lead.daysSinceContact}d`}
          </span>
          {lead.ownerInitials && (
            <span
              title={`SDR: ${lead.ownerName}`}
              className="h-5 w-5 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-500 text-[9px] font-bold text-white flex items-center justify-center"
            >
              {lead.ownerInitials}
            </span>
          )}
        </div>
      </div>

      {lead.closerName && (
        <div className="mt-1.5 text-[10px] text-zinc-400">Entregue a {lead.closerName}</div>
      )}
      {lead.lostReason && (
        <div className="mt-1.5 text-[10px] text-zinc-400 line-clamp-2">{lead.lostReason}</div>
      )}

      {/* Ações rápidas — aparecem no hover, sempre visíveis no toque */}
      <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100 transition-opacity">
        <QuickAction label="Abrir WhatsApp" onClick={() => onWhatsapp(lead)}>
          <MessageCircle className="h-3.5 w-3.5" />
        </QuickAction>
        <QuickAction label="Agendar ligação" onClick={() => onSchedule(lead)}>
          <CalendarPlus className="h-3.5 w-3.5" />
        </QuickAction>
        <QuickAction label="Mover etapa" onClick={() => onQuickMove(lead)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </QuickAction>
        {lead.attemptCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-zinc-400 tabular-nums">
            <Phone className="h-2.5 w-2.5" />
            {lead.attemptCount}
          </span>
        )}
      </div>
    </div>
  );
}

function QuickAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      draggable={false}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className="h-7 w-7 rounded-lg bg-zinc-50 text-zinc-500 flex items-center justify-center hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 transition-colors"
    >
      {children}
    </button>
  );
}
