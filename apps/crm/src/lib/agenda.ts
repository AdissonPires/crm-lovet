import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db, schema as s } from "@/db";

/**
 * Agenda de Hoje do dashboard — tarefas REAIS do CRM com vencimento hoje
 * do dia.
 */

export type StatusAgenda = "scheduled" | "late" | "done";

export interface CompromissoDoDia {
  id: string;
  /** HH:MM do vencimento (Brasília); "—" quando a tarefa não tem hora. */
  hora: string;
  /** Cliente/empresa/oportunidade ligada à tarefa; sem vínculo, o título. */
  cliente: string;
  /** "Ligação · Confirmar documentos" — tipo + título. */
  atividade: string;
  responsavel: string | null;
  status: StatusAgenda;
}

const TIPO: Record<string, string> = { call: "Ligação", email: "E-mail", meeting: "Reunião", visit: "Visita", todo: "Tarefa" };

/**
 * Tarefas com vencimento hoje. `responsavelId` restringe à própria pessoa
 * (consultora); sem ele, a equipe toda (gestão). Concluída = `done`; vencida e
 * aberta = `late`; o resto, `scheduled`.
 */
export async function agendaDoDia(workspaceId: string, agora: Date, responsavelId?: string): Promise<CompromissoDoDia[]> {
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 1);

  const tarefas = await db
    .select({
      id: s.tasks.id, title: s.tasks.title, type: s.tasks.type, dueAt: s.tasks.dueAt, completedAt: s.tasks.completedAt,
      relatedToType: s.tasks.relatedToType, relatedToId: s.tasks.relatedToId, responsavel: s.users.name,
    })
    .from(s.tasks)
    .leftJoin(s.users, eq(s.users.id, s.tasks.assigneeId))
    .where(and(
      eq(s.tasks.workspaceId, workspaceId), gte(s.tasks.dueAt, inicio), lt(s.tasks.dueAt, fim),
      responsavelId ? eq(s.tasks.assigneeId, responsavelId) : undefined,
    ))
    .orderBy(asc(s.tasks.dueAt));

  const nomes = await nomesDosVinculos(tarefas);
  return tarefas.map((t) => {
    const vinculo = t.relatedToId ? nomes.get(t.relatedToId) : undefined;
    const hora = t.dueAt!.getHours() === 0 && t.dueAt!.getMinutes() === 0
      ? "—"
      : `${String(t.dueAt!.getHours()).padStart(2, "0")}:${String(t.dueAt!.getMinutes()).padStart(2, "0")}`;
    return {
      id: t.id,
      hora,
      cliente: vinculo ?? t.title,
      atividade: vinculo ? `${TIPO[t.type] ?? "Tarefa"} · ${t.title}` : TIPO[t.type] ?? "Tarefa",
      responsavel: t.responsavel,
      status: t.completedAt ? "done" : t.dueAt! < agora && hora !== "—" ? "late" : "scheduled",
    };
  });
}

/** Nome do cliente/empresa/oportunidade/lead ligado a cada tarefa (uma consulta por tipo). */
async function nomesDosVinculos(tarefas: { relatedToType: string | null; relatedToId: string | null }[]): Promise<Map<string, string>> {
  const ids = (tipo: string) => [...new Set(tarefas.filter((t) => t.relatedToType === tipo && t.relatedToId).map((t) => t.relatedToId!))];
  const [contatos, empresas, oportunidades, leads] = await Promise.all([
    ids("contact").length ? db.select({ id: s.contacts.id, nome: s.contacts.name }).from(s.contacts).where(inArray(s.contacts.id, ids("contact"))) : [],
    ids("company").length ? db.select({ id: s.companies.id, nome: s.companies.name }).from(s.companies).where(inArray(s.companies.id, ids("company"))) : [],
    ids("opportunity").length ? db.select({ id: s.opportunities.id, nome: s.opportunities.name }).from(s.opportunities).where(inArray(s.opportunities.id, ids("opportunity"))) : [],
    ids("presales_lead").length ? db.select({ id: s.presalesLeads.id, nome: s.presalesLeads.name }).from(s.presalesLeads).where(inArray(s.presalesLeads.id, ids("presales_lead"))) : [],
  ]);
  return new Map([...contatos, ...empresas, ...oportunidades, ...leads].map((r) => [r.id, r.nome]));
}
