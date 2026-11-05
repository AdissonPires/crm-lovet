import { Activity, ArrowRight } from "lucide-react";

export type ActivityRow = {
  id: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  colorClass: string;
  text: string;
  time: string;
};

export function ActivitiesCard({ activities }: { activities: ActivityRow[] }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-brand-600" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-zinc-800">Últimas Atividades</h2>
      </div>

      <div className="flex-1 relative">
        {activities.length > 0 && <div className="absolute left-[15px] top-1 bottom-1 w-px bg-slate-100" />}
        <div className="space-y-4 max-h-[280px] overflow-y-auto pr-1">
          {activities.map((a) => (
            <div key={a.id} className="flex items-start gap-3 relative">
              <div className={`h-[30px] w-[30px] rounded-full ${a.colorClass} text-white flex items-center justify-center shrink-0 z-10 ring-4 ring-white`}>
                <a.Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div className="text-[12.5px] text-zinc-700 leading-snug line-clamp-2">{a.text}</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">{a.time}</div>
              </div>
            </div>
          ))}
          {activities.length === 0 && <div className="py-8 text-center text-sm text-zinc-400">Nenhuma atividade ainda.</div>}
        </div>
      </div>

      <div className="mt-5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-zinc-300 cursor-not-allowed select-none">
        Ver todas <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
      </div>
    </div>
  );
}
