import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db, schema as s } from "@/db";

export type HandoffCard = {
  id: string;
  conversationId: string;
  contactName: string;
  phone: string;
  sectorName: string | null;
  summary: string | null;
  createdAt: Date;
  /** Só para quem já assumiu — usado para mostrar "em atendimento por X". */
  claimedByName: string | null;
};

/**
 * Diz se o usuário está livre para receber um novo atendimento.
 *
 * "Livre" = nenhuma conversa atribuída a ele fora de "closed". É a regra que o
 * negócio pediu: o alerta aparece para quem NÃO está no meio de um atendimento,
 * senão a mesma notificação piscaria para todo mundo, inclusive para quem já
 * está ocupado com outro cliente.
 */
export async function isAgentAvailable(workspaceId: string, userId: string): Promise<boolean> {
  const abertas = await db
    .select({ id: s.whatsappConversations.id })
    .from(s.whatsappConversations)
    .where(and(
      eq(s.whatsappConversations.workspaceId, workspaceId),
      eq(s.whatsappConversations.assignedTo, userId),
      ne(s.whatsappConversations.status, "closed"),
    ))
    .limit(1);
  return abertas.length === 0;
}

/** Setores que este usuário atende. Vazio = atende todos (ex.: admin). */
export async function sectorsOf(workspaceId: string, userId: string): Promise<string[]> {
  const rows = await db.select({ sectorId: s.memberSectors.sectorId })
    .from(s.memberSectors)
    .where(and(eq(s.memberSectors.workspaceId, workspaceId), eq(s.memberSectors.userId, userId)));
  return rows.map((r) => r.sectorId);
}

/**
 * Pedidos de atendimento que ESTE usuário deve ver agora.
 *
 * Três regras, todas vindas do pedido do negócio:
 *  · só pendentes (quem já foi assumido sai da lista de todos os outros);
 *  · só dos setores que a pessoa atende — quem é do Financeiro não recebe
 *    alerta de Suporte;
 *  · só se a pessoa estiver livre. Ocupado não recebe alerta, porque o alerta
 *    é um chamado para ação imediata; empilhar em quem já está atendendo faria
 *    o cliente esperar por alguém que não pode responder.
 *
 * Quem não está vinculado a setor nenhum (admin/dono) vê todos os pedidos:
 * assim nenhum chamado fica invisível se um setor estiver sem gente.
 */
export async function pendingHandoffsFor(
  workspaceId: string,
  userId: string,
): Promise<HandoffCard[]> {
  if (!(await isAgentAvailable(workspaceId, userId))) return [];

  const meusSetores = await sectorsOf(workspaceId, userId);

  const filtroSetor = meusSetores.length > 0
    // `isNull` incluído de propósito: pedido que chegou antes de o cliente
    // escolher setor não pertence a ninguém e precisa aparecer para alguém.
    ? or(inArray(s.handoffRequests.sectorId, meusSetores), isNull(s.handoffRequests.sectorId))
    : undefined;

  const rows = await db
    .select({
      req: s.handoffRequests,
      sectorName: s.serviceSectors.name,
      claimedByName: s.users.name,
    })
    .from(s.handoffRequests)
    .leftJoin(s.serviceSectors, eq(s.serviceSectors.id, s.handoffRequests.sectorId))
    .leftJoin(s.users, eq(s.users.id, s.handoffRequests.claimedBy))
    .where(and(
      eq(s.handoffRequests.workspaceId, workspaceId),
      eq(s.handoffRequests.status, "pendente"),
      filtroSetor,
    ))
    .orderBy(asc(s.handoffRequests.createdAt));

  return rows.map(({ req, sectorName, claimedByName }) => ({
    id: req.id,
    conversationId: req.conversationId,
    contactName: req.contactName,
    phone: req.phone,
    sectorName: sectorName ?? null,
    summary: req.summary,
    createdAt: req.createdAt,
    claimedByName: claimedByName ?? null,
  }));
}
