export function brl(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** Como brl(), mas com centavos — para valores pequenos (ex.: custo por lead), onde arredondar a zero casas esconderia o valor todo. */
export function brlCents(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function daysSince(d: Date | string | null): number {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

export function dateBR(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

export function relTime(d: Date | string): string {
  const days = daysSince(d);
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 0) return `em ${-days}d`;
  return `há ${days}d`;
}

/** Saudação de acordo com o horário do servidor — nunca diz "Bom dia" à noite. */
export function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "23 de agosto de 2026" */
export function dateLongBR(d: Date = new Date()): string {
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

/** "Sábado" */
export function weekdayBR(d: Date = new Date()): string {
  return capitalize(d.toLocaleDateString("pt-BR", { weekday: "long" }));
}

/** "Ago" — usado como rótulo curto de eixo em gráficos mensais. */
export function monthShortBR(d: Date): string {
  return capitalize(d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""));
}
