"use client";

import { AlertTriangle, TrendingUp } from "lucide-react";
import type { BoardColumn } from "./types";

const dotTone: Record<string, string> = {
  sem_contato: "bg-sky-400",
  em_contato: "bg-violet-400",
  qualificacao: "bg-brand-400",
  aguardando_vendedor: "bg-emerald-400",
  convertido: "bg-emerald-600",
  incompativel: "bg-zinc-300",
};

export function PresalesColumnHeader({ column }: { column: BoardColumn }) {
  return (
    <div className="px-3.5 pt-3.5 pb-2.5 border-b border-zinc-100">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotTone[column.id] ?? "bg-zinc-300"}`} />
        <span className="text-[12.5px] font-bold text-zinc-700 leading-tight">{column.shortLabel}</span>
        <span className="text-[11px] rounded-full bg-white border border-zinc-200 px-1.5 py-0.5 text-zinc-500 font-semibold tabular-nums">
          {column.count}
        </span>
        {column.lateCount > 0 && (
          <span
            title={`${column.lateCount} lead(s) fora do SLA de ${column.slaDays} dia(s)`}
            className="inline-flex items-center gap-0.5 text-[10px] font-bold rounded-full bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 tabular-nums"
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            {column.lateCount}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span
          title="Valor estimado dos sistemas nesta etapa"
          className="text-[13px] font-bold text-zinc-800 tabular-nums"
        >
          {column.estimatedTotalText}
        </span>
        {column.conversionRate != null && (
          <span
            title="Taxa de conversão: leads que passaram por esta etapa e avançaram"
            className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${
              column.conversionRate >= 50 ? "text-emerald-600" : "text-zinc-400"
            }`}
          >
            <TrendingUp className="h-2.5 w-2.5" />
            {column.conversionRate}%
          </span>
        )}
      </div>

      {column.slaDays != null && (
        <div className="mt-1 text-[10px] text-zinc-400">SLA {column.slaDays}d</div>
      )}
    </div>
  );
}
