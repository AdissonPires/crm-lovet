import { TrendingUp } from "lucide-react";
import { brl } from "@/lib/format";

const W = 280;
const H = 140;
const PAD = 12;

export function SalesChartCard({ series }: { series: { month: string; value: number }[] }) {
  const values = series.map((d) => d.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const step = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0;

  const points = series.map((d, i) => ({
    x: PAD + step * i,
    y: PAD + (H - PAD * 2) * (1 - (d.value - min) / range),
    ...d,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${H - PAD} L ${points[0].x} ${H - PAD} Z`
    : "";

  return (
    <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-brand-600" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-zinc-800">Vendas dos Últimos 6 Meses</h2>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
          <defs>
            <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-500)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--brand-500)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {areaPath && <path d={areaPath} fill="url(#salesFill)" />}
          <path d={linePath} fill="none" stroke="var(--brand-600)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p) => (
            <g key={p.month}>
              <circle cx={p.x} cy={p.y} r="3.5" fill="white" stroke="var(--brand-600)" strokeWidth="2.5" />
              <title>{brl(p.value)}</title>
            </g>
          ))}
        </svg>
      </div>

      <div className="flex justify-between mt-2 px-1">
        {series.map((d) => (
          <span key={d.month} className="text-[10.5px] text-zinc-400 font-medium">{d.month}</span>
        ))}
      </div>
    </div>
  );
}
