import { card } from "@/components/ui";

/** Gráficos leves em SVG/HTML (sem biblioteca), com as cores da marca. */

export const PALETA = ["#009949", "var(--chart-grafite)", "#f5a524", "#4f9de0", "#8b6fd1", "#e06666", "#6bbf8a", "#a3b1a8"];

export const brlCompacto = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 2).replace(".", ",")} mi`;
  if (a >= 1_000) return `R$ ${Math.round(v / 1_000).toLocaleString("pt-BR")} mil`;
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
};
const mesCurto = (ym: string) => {
  const [a, m] = ym.split("-");
  return `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m) - 1]}/${a.slice(2)}`;
};

export function CardGrafico({ titulo, sub, children, className = "" }: { titulo: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${card} p-5 ${className}`}>
      <h2 className="text-sm font-semibold text-zinc-800">{titulo}</h2>
      {sub && <p className="text-[11.5px] text-zinc-400 mt-0.5">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Colunas por mês (faturamento) com linha opcional de meta. */
export function ColunasMensais({ dados, rotuloValor = "Faturamento", rotuloMeta = "Meta" }: { dados: { mes: string; valor: number; meta?: number }[]; rotuloValor?: string; rotuloMeta?: string }) {
  if (!dados.length) return <p className="text-sm text-zinc-400 py-8 text-center">Sem dados no período.</p>;
  const W = 720, H = 240, PL = 52, PR = 12, PT = 12, PB = 28;
  const max = Math.max(...dados.map((d) => Math.max(d.valor, d.meta ?? 0)), 1);
  const step = (W - PL - PR) / dados.length;
  const bw = Math.min(34, step * 0.58);
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const meta = dados.some((d) => d.meta);
  const linha = meta ? dados.map((d, i) => `${i ? "L" : "M"} ${PL + step * i + step / 2} ${y(d.meta ?? 0)}`).join(" ") : "";
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${rotuloValor} por mês`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} style={{ stroke: "var(--chart-grid)" }} strokeWidth="1" />
            <text x={PL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" style={{ fill: "var(--chart-text)" }}>{brlCompacto(t).replace("R$ ", "")}</text>
          </g>
        ))}
        {dados.map((d, i) => {
          const x = PL + step * i + (step - bw) / 2;
          return (
            <g key={d.mes}>
              <rect x={x} y={y(d.valor)} width={bw} height={Math.max(0, H - PB - y(d.valor))} rx="4" fill="#009949">
                <title>{`${mesCurto(d.mes)} — ${brlCompacto(d.valor)}`}</title>
              </rect>
              <text x={x + bw / 2} y={H - 10} textAnchor="middle" fontSize="10" style={{ fill: "var(--chart-text)" }}>{mesCurto(d.mes)}</text>
            </g>
          );
        })}
        {meta && <path d={linha} fill="none" stroke="#f5a524" strokeWidth="2.2" strokeDasharray="5 4" strokeLinejoin="round" />}
        {meta && dados.map((d, i) => <circle key={d.mes} cx={PL + step * i + step / 2} cy={y(d.meta ?? 0)} r="3" fill="#fff" stroke="#f5a524" strokeWidth="2"><title>{`${mesCurto(d.mes)} — meta ${brlCompacto(d.meta ?? 0)}`}</title></circle>)}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-[11.5px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#009949]" />{rotuloValor}</span>
        {meta && <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-4 bg-[#f5a524]" />{rotuloMeta} (demonstrativa)</span>}
      </div>
    </div>
  );
}

/** Barras horizontais ordenadas, com rótulo e valor — funciona bem em listas longas. */
export function BarrasHorizontais({ dados, formato = brlCompacto, cor = "#009949", sub }: {
  dados: { label: string; valor: number; extra?: string }[]; formato?: (v: number) => string; cor?: string; sub?: boolean;
}) {
  if (!dados.length) return <p className="text-sm text-zinc-400 py-6 text-center">Sem dados no período.</p>;
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return (
    <ul className="space-y-2.5">
      {dados.map((d) => (
        <li key={d.label}>
          <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="text-zinc-700 truncate" title={d.label}>{d.label}</span>
            <span className="font-semibold text-zinc-900 tabular-nums shrink-0">{formato(d.valor)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-zinc-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (d.valor / max) * 100)}%`, background: cor }} />
          </div>
          {sub && d.extra && <div className="text-[11px] text-zinc-400 mt-0.5">{d.extra}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Rosca com legenda (participação). */
export function Rosca({ dados, formato = brlCompacto }: { dados: { label: string; valor: number }[]; formato?: (v: number) => string }) {
  const total = dados.reduce((a, d) => a + d.valor, 0);
  if (!total) return <p className="text-sm text-zinc-400 py-6 text-center">Sem dados no período.</p>;
  const R = 52, C = 2 * Math.PI * R;
  const inicios = dados.map((_, i) => dados.slice(0, i).reduce((a, x) => a + (x.valor / total) * C, 0));
  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 140 140" className="w-40 h-40 shrink-0 -rotate-90" role="img" aria-label="Participação">
        <circle cx="70" cy="70" r={R} fill="none" style={{ stroke: "var(--chart-track)" }} strokeWidth="22" />
        {dados.map((d, i) => {
          const len = (d.valor / total) * C;
          return <circle key={d.label} cx="70" cy="70" r={R} fill="none" style={{ stroke: PALETA[i % PALETA.length] }} strokeWidth="22" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-inicios[i]}><title>{`${d.label}: ${formato(d.valor)}`}</title></circle>;
        })}
      </svg>
      <ul className="flex-1 min-w-0 w-full space-y-1.5">
        {dados.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-[12.5px]">
            <i className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: PALETA[i % PALETA.length] }} />
            <span className="truncate text-zinc-700" title={d.label}>{d.label}</span>
            <span className="ml-auto tabular-nums text-zinc-500 shrink-0">{((d.valor / total) * 100).toFixed(1).replace(".", ",")}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Pílulas de contagem (status, curva ABC, RFM etc.). */
export function Contagens({ dados }: { dados: { label: string; valor: number }[] }) {
  const total = dados.reduce((a, d) => a + d.valor, 0) || 1;
  return (
    <ul className="space-y-1.5">
      {dados.map((d, i) => (
        <li key={d.label} className="flex items-center gap-2 text-[12.5px]">
          <i className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: PALETA[i % PALETA.length] }} />
          <span className="text-zinc-700 truncate">{d.label}</span>
          <span className="ml-auto font-semibold tabular-nums text-zinc-900">{d.valor.toLocaleString("pt-BR")}</span>
          <span className="w-12 text-right tabular-nums text-zinc-400">{((d.valor / total) * 100).toFixed(0)}%</span>
        </li>
      ))}
    </ul>
  );
}

export function AvisoSimulado({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900">
      <b>Dados simulados.</b> {children ?? "Valores, clientes e pedidos deste painel são fictícios (lote LOVET_DEMO_2025_11_2026_10_V1) e não representam o faturamento real da Lovet."}
    </div>
  );
}
