import { and, asc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db, schema as s } from "@/db";

/**
 * Equipes internas e produção semanal — dados REAIS do CRM.
 *
 * Equipes = cadastro da gestão em Equipe e acessos; produção =
 * tarefas do CRM concluídas pelos integrantes.
 */

export interface Pessoa {
  id: string;
  nome: string;
}

export interface Equipe {
  id: string;
  nome: string;
  lider: Pessoa | null;
  membros: Pessoa[];
}

export interface ProducaoSemana {
  /** Segunda-feira da semana, AAAA-MM-DD. */
  semana: string;
  label: string; // "06/10"
  /** Tarefas concluídas pelos integrantes na semana. */
  concluidas: number;
  /** Meta da semana — ainda não existe meta de atividades no CRM (null = sem linha de meta). */
  meta: number | null;
}

export async function listarEquipes(workspaceId: string): Promise<Equipe[]> {
  const linhas = await db
    .select({ id: s.equipes.id, nome: s.equipes.nome, liderId: s.equipes.liderId })
    .from(s.equipes)
    .where(eq(s.equipes.workspaceId, workspaceId))
    .orderBy(asc(s.equipes.nome));
  if (linhas.length === 0) return [];

  const membros = await db
    .select({ equipeId: s.equipeMembros.equipeId, id: s.users.id, nome: s.users.name })
    .from(s.equipeMembros)
    .innerJoin(s.users, eq(s.users.id, s.equipeMembros.userId))
    .where(inArray(s.equipeMembros.equipeId, linhas.map((l) => l.id)))
    .orderBy(asc(s.users.name));
  const lideres = linhas.map((l) => l.liderId).filter((v): v is string => !!v);
  const nomesLider = lideres.length
    ? new Map((await db.select({ id: s.users.id, nome: s.users.name }).from(s.users).where(inArray(s.users.id, lideres))).map((u) => [u.id, u.nome]))
    : new Map<string, string>();

  return linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    lider: l.liderId ? { id: l.liderId, nome: nomesLider.get(l.liderId) ?? "—" } : null,
    membros: membros.filter((m) => m.equipeId === l.id).map((m) => ({ id: m.id, nome: m.nome })),
  }));
}

export async function obterEquipe(workspaceId: string, id: string): Promise<Equipe | null> {
  return (await listarEquipes(workspaceId)).find((e) => e.id === id) ?? null;
}

const segundaDe = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // segunda = 0
  return x;
};
const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Tarefas concluídas por semana (segunda a domingo) pelos integrantes, até 12
 * semanas terminando em `ate`. Semanas sem nada aparecem com zero.
 */
export async function producaoEquipe(workspaceId: string, equipe: Equipe, de: Date, ate: Date): Promise<ProducaoSemana[]> {
  const fim = segundaDe(ate);
  let inicio = segundaDe(de);
  const limite = new Date(fim);
  limite.setDate(limite.getDate() - 11 * 7);
  if (inicio < limite) inicio = limite;

  const semanas: ProducaoSemana[] = [];
  for (const d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 7)) {
    semanas.push({ semana: isoDia(d), label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, concluidas: 0, meta: null });
  }
  const ids = equipe.membros.map((m) => m.id);
  if (ids.length === 0 || semanas.length === 0) return semanas;

  const fimUltimaSemana = new Date(fim);
  fimUltimaSemana.setDate(fimUltimaSemana.getDate() + 7);
  const concluidas = await db
    .select({ completedAt: s.tasks.completedAt })
    .from(s.tasks)
    .where(and(
      eq(s.tasks.workspaceId, workspaceId), inArray(s.tasks.assigneeId, ids), isNotNull(s.tasks.completedAt),
      gte(s.tasks.completedAt, inicio), lte(s.tasks.completedAt, fimUltimaSemana),
    ));
  const porSemana = new Map(semanas.map((x) => [x.semana, x]));
  for (const t of concluidas) {
    const semana = porSemana.get(isoDia(segundaDe(t.completedAt!)));
    if (semana) semana.concluidas += 1;
  }
  return semanas;
}
