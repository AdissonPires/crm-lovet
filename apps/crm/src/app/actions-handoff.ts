"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { limparCacheDadosAgora } from "@/lib/cache-dados";

export type HandoffResult = { ok: boolean; error?: string };

/**
 * Assume um pedido de atendimento.
 *
 * O `isNull(claimedBy)` no WHERE é o que evita dois atendentes pegarem o mesmo
 * cliente: o alerta aparece para várias pessoas ao mesmo tempo, então dois
 * cliques simultâneos são esperados. Quem chega depois recebe zero linhas
 * atualizadas e vê a mensagem de que já foi assumido, em vez de os dois
 * responderem ao mesmo cliente.
 */
export async function claimHandoff(requestId: string): Promise<HandoffResult> {
  const user = await requireUser();

  const atualizados = await db.update(s.handoffRequests).set({
    status: "atendido",
    claimedBy: user.id,
    claimedAt: new Date(),
  }).where(and(
    eq(s.handoffRequests.id, requestId),
    eq(s.handoffRequests.workspaceId, user.workspaceId),
    eq(s.handoffRequests.status, "pendente"),
    isNull(s.handoffRequests.claimedBy),
  )).returning({ conversationId: s.handoffRequests.conversationId });

  if (atualizados.length === 0) {
    return { ok: false, error: "Outro atendente já assumiu este cliente." };
  }

  const conversationId = atualizados[0].conversationId;

  // Atribui a conversa a quem assumiu — é isso que o torna "ocupado" e faz o
  // alerta parar de aparecer para ele (ver isAgentAvailable).
  await db.update(s.whatsappConversations).set({
    assignedTo: user.id,
    status: "open",
  }).where(eq(s.whatsappConversations.id, conversationId));

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "whatsapp_conversation", relatedToId: conversationId,
    type: "note", payload: { text: `${user.name} assumiu o atendimento.` },
  });

  revalidatePath("/");

  limparCacheDadosAgora();
  revalidatePath("/whatsapp");
  revalidatePath("/atendimentos");
  return { ok: true };
}

/** Variante para `<form action>`, que exige retorno void. */
export async function finishServiceForm(conversationId: string): Promise<void> {
  await finishService(conversationId);
}

/** Assume e vai direto para a conversa — o caminho normal a partir do alerta. */
export async function claimAndOpen(requestId: string): Promise<void> {
  const user = await requireUser();
  const result = await claimHandoff(requestId);

  const [req] = await db.select({ conversationId: s.handoffRequests.conversationId })
    .from(s.handoffRequests)
    .where(and(eq(s.handoffRequests.id, requestId), eq(s.handoffRequests.workspaceId, user.workspaceId)));

  if (!result.ok || !req) redirect("/atendimentos?erro=assumido");
  redirect(`/whatsapp?c=${req.conversationId}`);
}

/**
 * Encerra o atendimento e devolve a conversa ao bot.
 *
 * Sem isto o atendente ficaria "ocupado" para sempre depois do primeiro
 * cliente, e pararia de receber alerta de novos pedidos.
 */
export async function finishService(conversationId: string): Promise<HandoffResult> {
  const user = await requireUser();

  await db.update(s.whatsappConversations).set({
    status: "closed",
    botStatus: "auto",
    flowState: "menu",
    serviceSectorId: null,
  }).where(and(
    eq(s.whatsappConversations.id, conversationId),
    eq(s.whatsappConversations.workspaceId, user.workspaceId),
  ));

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "whatsapp_conversation", relatedToId: conversationId,
    type: "note", payload: { text: `${user.name} encerrou o atendimento.` },
  });

  revalidatePath("/");

  limparCacheDadosAgora();
  revalidatePath("/whatsapp");
  revalidatePath("/atendimentos");
  return { ok: true };
}
