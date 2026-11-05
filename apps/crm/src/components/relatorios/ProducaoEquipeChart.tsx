import type { ProducaoSemana } from "@/lib/equipes";

const W = 900;
const H = 250;
const PAD_L = 38;
const PAD_R = 16;
const PAD_TOP = 24;
const PAD_BOTTOM = 30;

/**
 * Produção semanal da equipe: barras (tarefas concluídas). Quando houver meta,
 * linha tracejada e barra verde = bateu, azul = abaixo; sem meta, só as barras.
 */
export function ProducaoEquipeChart({ semanas }: { semanas: ProducaoSemana[] }) {
  if (semanas.length === 0) {
    return <p className="py-10 text-center text-sm text-zinc-400">Sem semanas no período escolhido.</p>;
  }

  const n = semanas.length;
  const areaW = W - PAD_L - PAD_R;
  const areaH = H - PAD_TOP - PAD_BOTTOM;
  const slot = areaW / n;
  const barW = Math.min(slot * 0.58, 48);
  const temMeta = semanas.some((s) => s.meta !== null);
  const max = Math.max(...semanas.map((s) => Math.max(s.concluidas, s.meta ?? 0)), 1);
  const y = (v: number) => PAD_TOP + areaH - (v / max) * areaH;
  const cx = (i: number) => PAD_L + slot * i + slot / 2;
  const linhaMeta = temMeta ? semanas.map((s, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${y(s.meta ?? 0).toFixed(1)}`).join(" ") : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Tarefas concluídas por semana pela equipe">
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <g key={g}>
          <line x1={PAD_L} x2={W - PAD_R} y1={PAD_TOP + areaH * (1 - g)} y2={PAD_TOP + areaH * (1 - g)} className="stroke-zinc-100" />
          <text x={PAD_L - 6} y={PAD_TOP + areaH * (1 - g) + 3} textAnchor="end" className="fill-zinc-400 text-[10px]">
            {Math.round(max * g)}
          </text>
        </g>
      ))}

      {semanas.map((s, i) => {
        const h = (s.concluidas / max) * areaH;
        const bateu = s.meta !== null && s.concluidas >= s.meta;
        return (
          <g key={s.semana}>
            <title>{`Semana de ${s.label}: ${s.concluidas} concluídas${s.meta !== null ? ` (meta ${s.meta})` : ""}`}</title>
            <rect x={cx(i) - barW / 2} y={PAD_TOP + areaH - h} width={barW} height={h} rx={3} fill={bateu ? "#10b981" : "#0475d7"} />
            <text x={cx(i)} y={PAD_TOP + areaH - h - 5} textAnchor="middle" className="fill-zinc-600 text-[10px] font-semibold">
              {s.concluidas}
            </text>
            <text x={cx(i)} y={H - 10} textAnchor="middle" className="fill-zinc-500 text-[10px]">{s.label}</text>
          </g>
        );
      })}

      {linhaMeta && <path d={linhaMeta} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />}
    </svg>
  );
}
