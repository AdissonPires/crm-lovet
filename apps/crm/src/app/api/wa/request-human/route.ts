import { NextResponse } from "next/server";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";
import { idsComLoginAtivoNoCrm } from "@/lib/colaboradores";

/**
 * Cliente pediu atendente humano dentro de um setor.
 *
 * Faz três coisas de uma vez, porque as três precisam valer juntas:
 *  1. pausa o bot na conversa (flowState = human);
 *  2. abre um pedido em handoff_requests, que é o que a equipe vê;
 *  3. registra a atividade, para o histórico do cliente.
 *
 * A notificação não é gravada por destinatário: quem deve ver é calculado na
 * leitura (ver /lib/handoff.ts). Gravar uma linha por atendente exigiria
 * reprocessar tudo a cada pessoa que entra ou sai de atendimento — e o
 * "quem está livre agora" muda a cada mensagem recebida.
 *
 * Body: { conversationId, summary? }
 */
export async function POST(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const conversationId = String(body?.conversationId ?? "").trim();
  const summary = String(body?.summary ?? "").trim() || null;
  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "conversationId required" }, { status: 400 });
  }

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  const [conv] = await db.select().from(s.whatsappConversations).where(and(
    eq(s.whatsappConversations.workspaceId, workspace.id),
    eq(s.whatsappConversations.id, conversationId),
  ));
  if (!conv) return NextResponse.json({ ok: false, error: "conversa não encontrada" }, { status: 404 });

  // Pedido já pendente na mesma conversa não vira um segundo: o cliente que
  // repete "quero falar com alguém" não deve gerar duas notificações.
  const [pendente] = await db.select().from(s.handoffRequests).where(and(
    eq(s.handoffRequests.conversationId, conversationId),
    eq(s.handoffRequests.status, "pendente"),
  ));

  let sectorName: string | null = null;
  if (conv.serviceSectorId) {
    const [sec] = await db.select({ name: s.serviceSectors.name })
      .from(s.serviceSectors).where(eq(s.serviceSectors.id, conv.serviceSectorId));
    sectorName = sec?.name ?? null;
  }

  if (!pendente) {
    await db.insert(s.handoffRequests).values({
      workspaceId: workspace.id,
      conversationId,
      sectorId: conv.serviceSectorId,
      contactName: conv.contactName,
      phone: conv.phone,
      summary,
    });

    await db.insert(s.activities).values({
      workspaceId: workspace.id, actorId: null, actorType: "system",
      relatedToType: "whatsapp_conversation", relatedToId: conversationId,
      type: "note",
      payload: {
        text: `${conv.contactName} solicitou atendente humano${sectorName ? ` — setor ${sectorName}` : ""}.`,
      },
    });
  }

  await db.update(s.whatsappConversations).set({
    botStatus: "human",
    flowState: "human",
    status: "pending",
  }).where(eq(s.whatsappConversations.id, conversationId));

  // Quantos atendentes do setor estão livres agora — devolvido para o
  // workflow poder ajustar a mensagem ("já estou chamando" x "logo alguém
  // assume") em vez de prometer atendimento imediato sempre.
  const livres = await countAvailableAgents(workspace.id, conv.serviceSectorId);

  return NextResponse.json({
    ok: true,
    sector: sectorName,
    availableAgents: livres,
    alreadyPending: !!pendente,
  });
}

/**
 * Atendentes do setor que não estão com nenhuma conversa em atendimento.
 *
 * "Livre" = não tem conversa atribuída a ele que esteja aberta ou em espera.
 * Conversa fechada não conta, senão quem já atendeu no dia nunca voltaria a
 * aparecer como disponível.
 */
async function countAvailableAgents(workspaceId: string, sectorId: string | null): Promise<number> {
  const doSetor = sectorId
    ? await db.select({ userId: s.memberSectors.userId }).from(s.memberSectors)
        .where(and(eq(s.memberSectors.workspaceId, workspaceId), eq(s.memberSectors.sectorId, sectorId)))
    // Sem setor: só conta quem consegue entrar no CRM (login ativo). Membro criado pelo sync,
    // sem login, não atende — contá-lo fazia o bot prometer um humano que não existe.
    : [...await idsComLoginAtivoNoCrm(workspaceId)].map((userId) => ({ userId }));

  const ids = doSetor.map((r) => r.userId);
  if (ids.length === 0) return 0;

  const ocupados = await db
    .select({ userId: s.whatsappConversations.assignedTo })
    .from(s.whatsappConversations)
    .where(and(
      eq(s.whatsappConversations.workspaceId, workspaceId),
      ne(s.whatsappConversations.status, "closed"),
      inArray(s.whatsappConversations.assignedTo, ids),
    ))
    .groupBy(s.whatsappConversations.assignedTo);

  const ocupadosSet = new Set(ocupados.map((o) => o.userId).filter(Boolean));
  return ids.filter((id) => !ocupadosSet.has(id)).length;
}
