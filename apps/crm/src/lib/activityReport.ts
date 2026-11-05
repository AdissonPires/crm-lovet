import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { can } from "@/lib/policy";
import { obterEquipe, producaoEquipe, type Equipe, type ProducaoSemana } from "@/lib/equipes";

export type ActivityReportData = {
  userName: string;
  from: Date;
  to: Date;
  tasksCompleted: { title: string; completedAt: Date }[];
  tasksPending: { title: string; dueAt: Date | null }[];
  callsLogged: { text: string; createdAt: Date }[];
  /** Oportunidades ganhas por ela no período. */
  vendas: { quantidade: number; faturamento: number };
  /** Valor das oportunidades em aberto e perdidas dela no período. */
  valores: { aberto: number; perdido: number };
  notes: string;
};

/**
 * Quem pode ver o relatório de OUTRA pessoa ou de uma equipe: quem enxerga o
 * dashboard consolidado (owner/admin/manager). Os demais só o próprio.
 */
export function podeVerRelatorioDeOutros(role: string): boolean {
  return can(role, "view_team_dashboard");
}

/** Colaborador de quem o relatório é — o próprio usuário, ou outro (só gestor, dentro do workspace). */
export async function resolverColaboradorDoRelatorio(
  user: { id: string; name: string; role: string; workspaceId: string },
  colaboradorId: string | null | undefined,
): Promise<{ id: string; name: string }> {
  if (!colaboradorId || colaboradorId === user.id) return { id: user.id, name: user.name };
  if (!podeVerRelatorioDeOutros(user.role)) throw new Error("FORBIDDEN");
  const [alvo] = await db
    .select({ id: s.users.id, name: s.users.name })
    .from(s.workspaceMembers)
    .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
    .where(and(eq(s.workspaceMembers.workspaceId, user.workspaceId), eq(s.users.id, colaboradorId)));
  if (!alvo) throw new Error("Colaborador não encontrado.");
  return alvo;
}

/** Membros do workspace — opções do seletor "individual". */
export async function listarColaboradorasDaEquipe(workspaceId: string): Promise<{ id: string; name: string }[]> {
  const membros = await db
    .select({ id: s.users.id, name: s.users.name })
    .from(s.workspaceMembers)
    .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
    .where(eq(s.workspaceMembers.workspaceId, workspaceId));
  return membros.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Junta tudo que o usuario fez no periodo: tarefas (concluidas e pendentes
 * atribuidas a ele), ligacoes registradas por ele (activities type
 * call_logged), as oportunidades ganhas por ele e os valores em aberto e
 * perdidos. Fonte unica pro PDF, pro email e pra tela.
 */
export async function collectActivityReport(
  userId: string, workspaceId: string, userName: string, from: Date, to: Date, notes: string,
): Promise<ActivityReportData> {
  const allTasks = await db.select().from(s.tasks)
    .where(and(eq(s.tasks.workspaceId, workspaceId), eq(s.tasks.assigneeId, userId)));

  const tasksCompleted = allTasks
    .filter((t) => t.completedAt && t.completedAt >= from && t.completedAt <= to)
    .map((t) => ({ title: t.title, completedAt: t.completedAt! }))
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

  const tasksPending = allTasks
    .filter((t) => !t.completedAt)
    .map((t) => ({ title: t.title, dueAt: t.dueAt }));

  const calls = await db.select().from(s.activities)
    .where(and(
      eq(s.activities.workspaceId, workspaceId),
      eq(s.activities.actorId, userId),
      eq(s.activities.type, "call_logged"),
      gte(s.activities.createdAt, from),
      lte(s.activities.createdAt, to),
    ))
    .orderBy(desc(s.activities.createdAt));

  const callsLogged = calls.map((c) => ({
    text: String((c.payload as { text?: string })?.text ?? "Ligação registrada"),
    createdAt: c.createdAt,
  }));

  const o = s.opportunities;
  const [resumo] = await db
    .select({
      vendas: sql<number>`count(*) filter (where ${o.status} = 'won' and ${o.closedAt} >= ${from} and ${o.closedAt} <= ${to})::int`,
      faturamento: sql<number>`coalesce(sum(${o.amount}) filter (where ${o.status} = 'won' and ${o.closedAt} >= ${from} and ${o.closedAt} <= ${to}), 0)::float`,
      aberto: sql<number>`coalesce(sum(${o.amount}) filter (where ${o.status} = 'open' and ${o.createdAt} <= ${to}), 0)::float`,
      perdido: sql<number>`coalesce(sum(${o.amount}) filter (where ${o.status} = 'lost' and ${o.updatedAt} >= ${from} and ${o.updatedAt} <= ${to}), 0)::float`,
    })
    .from(o)
    .where(and(eq(o.workspaceId, workspaceId), eq(o.ownerId, userId)));

  return {
    userName, from, to, tasksCompleted, tasksPending, callsLogged,
    vendas: { quantidade: resumo?.vendas ?? 0, faturamento: resumo?.faturamento ?? 0 },
    valores: { aberto: resumo?.aberto ?? 0, perdido: resumo?.perdido ?? 0 },
    notes,
  };
}

// ── Relatório por equipe ──────────────────────────────────────────────────

export interface MembroRelatorio {
  nome: string;
  /** Nulo quando o integrante da equipe não existe como usuário no CRM. */
  userId: string | null;
  tarefasConcluidas: number;
  tarefasPendentes: number;
  ligacoes: number;
  /** Valor das oportunidades em aberto / perdidas no período. */
  emAberto: number;
  perdido: number;
  vendas: number;
  faturamento: number;
}

export interface RelatorioEquipe {
  equipe: Equipe;
  from: Date;
  to: Date;
  membros: MembroRelatorio[];
  totais: Omit<MembroRelatorio, "nome" | "userId">;
  /** Tarefas do CRM concluídas pelos integrantes, por semana (ver lib/equipes.ts). */
  producao: ProducaoSemana[];
}

/**
 * Atividade da equipe: equipe e integrantes vêm do cadastro de Equipes (Equipe
 * e acessos); os números de cada integrante são do CRM (mesma definição do
 * relatório individual) e a produção semanal são as tarefas concluídas.
 */
export async function collectTeamActivityReport(
  workspaceId: string, equipeId: string, from: Date, to: Date,
): Promise<RelatorioEquipe | null> {
  const equipe = await obterEquipe(workspaceId, equipeId);
  if (!equipe) return null;

  const membros: MembroRelatorio[] = equipe.membros.map((m) => ({
    nome: m.nome, userId: m.id,
    tarefasConcluidas: 0, tarefasPendentes: 0, ligacoes: 0, emAberto: 0, perdido: 0, vendas: 0, faturamento: 0,
  }));
  const ids = membros.map((m) => m.userId).filter((v): v is string => !!v);
  const porId = new Map(membros.filter((m) => m.userId).map((m) => [m.userId as string, m]));

  if (ids.length > 0) {
    const [tarefas, ligacoes, resumos] = await Promise.all([
      db.select({ assigneeId: s.tasks.assigneeId, completedAt: s.tasks.completedAt })
        .from(s.tasks)
        .where(and(eq(s.tasks.workspaceId, workspaceId), inArray(s.tasks.assigneeId, ids))),
      db.select({ actorId: s.activities.actorId, total: sql<number>`count(*)::int` })
        .from(s.activities)
        .where(and(
          eq(s.activities.workspaceId, workspaceId), inArray(s.activities.actorId, ids),
          eq(s.activities.type, "call_logged"), gte(s.activities.createdAt, from), lte(s.activities.createdAt, to),
        ))
        .groupBy(s.activities.actorId),
      db.select({
        ownerId: s.opportunities.ownerId,
        vendas: sql<number>`count(*) filter (where ${s.opportunities.status} = 'won' and ${s.opportunities.closedAt} >= ${from} and ${s.opportunities.closedAt} <= ${to})::int`,
        faturamento: sql<number>`coalesce(sum(${s.opportunities.amount}) filter (where ${s.opportunities.status} = 'won' and ${s.opportunities.closedAt} >= ${from} and ${s.opportunities.closedAt} <= ${to}), 0)::float`,
        aberto: sql<number>`coalesce(sum(${s.opportunities.amount}) filter (where ${s.opportunities.status} = 'open' and ${s.opportunities.createdAt} <= ${to}), 0)::float`,
        perdido: sql<number>`coalesce(sum(${s.opportunities.amount}) filter (where ${s.opportunities.status} = 'lost' and ${s.opportunities.updatedAt} >= ${from} and ${s.opportunities.updatedAt} <= ${to}), 0)::float`,
      })
        .from(s.opportunities)
        .where(and(eq(s.opportunities.workspaceId, workspaceId), inArray(s.opportunities.ownerId, ids)))
        .groupBy(s.opportunities.ownerId),
    ]);

    for (const t of tarefas) {
      const m = t.assigneeId ? porId.get(t.assigneeId) : undefined;
      if (!m) continue;
      if (!t.completedAt) m.tarefasPendentes += 1;
      else if (t.completedAt >= from && t.completedAt <= to) m.tarefasConcluidas += 1;
    }
    for (const l of ligacoes) { const m = l.actorId ? porId.get(l.actorId) : undefined; if (m) m.ligacoes = l.total; }
    for (const r of resumos) {
      const m = r.ownerId ? porId.get(r.ownerId) : undefined;
      if (m) { m.emAberto = r.aberto; m.perdido = r.perdido; m.vendas = r.vendas; m.faturamento = r.faturamento; }
    }
  }

  const totais = membros.reduce(
    (a, m) => ({
      tarefasConcluidas: a.tarefasConcluidas + m.tarefasConcluidas,
      tarefasPendentes: a.tarefasPendentes + m.tarefasPendentes,
      ligacoes: a.ligacoes + m.ligacoes,
      emAberto: a.emAberto + m.emAberto,
      perdido: a.perdido + m.perdido,
      vendas: a.vendas + m.vendas,
      faturamento: a.faturamento + m.faturamento,
    }),
    { tarefasConcluidas: 0, tarefasPendentes: 0, ligacoes: 0, emAberto: 0, perdido: 0, vendas: 0, faturamento: 0 },
  );

  return {
    equipe, from, to, membros, totais,
    producao: await producaoEquipe(workspaceId, equipe, from, to),
  };
}
