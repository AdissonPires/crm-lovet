import { TrendingUp, TrendingDown } from "lucide-react";

export type Kpi = {
  label: string;
  value: string;
  sub?: string;
  delta?: string | null;
  positive?: boolean;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tint: string;
};

export function KpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="rounded-2xl bg-white border border-slate-200/60 shadow-sm p-5">
          <div className="flex items-start justify-between">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${kpi.tint}`}>
              <kpi.Icon className="h-5 w-5" strokeWidth={2} />
            </div>
            {kpi.delta && (
              <span className={`inline-flex items-center gap-1 rounded-full text-[11px] font-semibold px-2 py-1 ${
                kpi.positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              }`}>
                {kpi.positive ? <TrendingUp className="h-3 w-3" strokeWidth={2.5} /> : <TrendingDown className="h-3 w-3" strokeWidth={2.5} />}
                {kpi.delta}
              </span>
            )}
          </div>
          <div className="mt-4 text-2xl font-bold text-zinc-900 tracking-tight">{kpi.value}</div>
          <div className="mt-0.5 text-[12.5px] text-zinc-500">{kpi.label}</div>
          {kpi.sub && <div className="mt-1 text-[12px] font-medium text-brand-700">{kpi.sub}</div>}
        </div>
      ))}
    </div>
  );
}
