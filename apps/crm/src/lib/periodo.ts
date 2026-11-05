/**
 * Período "De/Até" vindo de um <input type="date"> (AAAA-MM-DD), em Brasília.
 *
 * `new Date("2026-10-23")` é meia-noite em UTC = 22/10 às 21h em Brasília: o
 * "Até" cortava o último dia inteiro (e o `setHours(23,59)` em cima disso só
 * levava a 22/10 23h59). Aqui o "De" começa às 00:00 e o "Até" termina às
 * 23:59:59.999 do dia escolhido, no horário de Brasília. Inválido → null.
 */
export function inicioDoDia(v: string | null | undefined): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fimDoDia(v: string | null | undefined): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T23:59:59.999-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
