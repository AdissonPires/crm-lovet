import Link from "next/link";
import { CalendarClock, ArrowRight } from "lucide-react";

const statusLabel: Record<string, string> = {
  scheduled: "A fazer",
  late: "Atrasada",
  done: "Concluída",
};
const statusStyle: Record<string, string> = {
  scheduled: "bg-sky-50 text-sky-700 border-sky-200",
  late: "bg-red-50 text-red-700 border-red-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
export type AgendaItem = {
  id: string;
  time: string;
  client: string;
  kind: string;
  status: string;
  responsavel?: string;
};

/** Agenda de Hoje — tarefas do CRM com vencimento hoje (lib/agenda.ts). */
export function AgendaCard({ items }: { items: AgendaItem[] }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <CalendarClock className="h-4 w-4 text-brand-600" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-zinc-800">Agenda de Hoje</h2>
      </div>

      <div className="flex-1 divide-y divide-slate-50 max-h-[340px] overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.id} className="py-2.5 flex items-center gap-3">
            <div className="w-12 shrink-0 text-[12px] font-bold text-brand-700 tabular-nums">{item.time}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold text-zinc-800 truncate">{item.client}</div>
              <div className="text-[11px] text-zinc-400 truncate">{item.kind}{item.responsavel ? ` · ${item.responsavel}` : ""}</div>
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${statusStyle[item.status] ?? statusStyle.scheduled}`}>
              {statusLabel[item.status] ?? item.status}
            </span>
          </div>
        ))}
        {items.length === 0 && <div className="py-8 text-center text-sm text-zinc-400">Nenhuma tarefa com vencimento hoje.</div>}
      </div>

      <Link href="/tarefas" className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 hover:text-brand-800 transition-colors">
        Ver todas as tarefas <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
      </Link>
    </div>
  );
}
