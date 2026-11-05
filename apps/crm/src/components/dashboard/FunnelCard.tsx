import { Filter } from "lucide-react";

const colorRamp = ["bg-brand-300", "bg-brand-400", "bg-brand-500", "bg-brand-600", "bg-brand-700", "bg-brand-800"];

export function FunnelCard({
  stages, wonThisMonth,
}: {
  stages: { label: string; value: number }[];
  wonThisMonth: number;
}) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  const legend = [...stages, { label: "Fechadas Mês", value: wonThisMonth }];

  return (
    <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-5">
        <Filter className="h-4 w-4 text-brand-600" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-zinc-800">Funil de Oportunidades</h2>
      </div>

      {stages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-zinc-400 py-8">Nenhuma etapa configurada.</div>
      ) : (
        <div className="flex flex-col items-center gap-1.5 py-2">
          {stages.map((stage, i) => {
            const widthPct = 30 + (stage.value / max) * 70;
            const color = colorRamp[Math.min(i, colorRamp.length - 1)];
            return (
              <div
                key={stage.label}
                style={{ width: `${widthPct}%` }}
                className={`h-9 rounded-md ${color} flex items-center justify-center text-white text-[12.5px] font-bold shadow-sm px-2 text-center`}
              >
                {stage.value}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
        {legend.map((row, i) => (
          <div key={row.label} className="flex items-center justify-between text-[12.5px]">
            <span className="flex items-center gap-2 text-zinc-500 truncate">
              <span className={`h-2 w-2 rounded-full shrink-0 ${i < stages.length ? colorRamp[Math.min(i, colorRamp.length - 1)] : "bg-emerald-500"}`} />
              <span className="truncate">{row.label}</span>
            </span>
            <span className="font-semibold text-zinc-800 shrink-0">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
