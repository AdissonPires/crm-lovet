"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { appInternalUrl, sendWhatsappMedia, sendWhatsappMessage, type MediaKind } from "@/lib/whatsapp";
import { salvarMidiaMensagem, TAMANHO_MAXIMO, TIPOS_DOCUMENTO, TIPOS_IMAGEM, TIPOS_VIDEO } from "@/lib/storage";

export async function sendMessage(conversationId: string, formData: FormData) {
  const user = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  const anexo = formData.get("attachment");
  const hasAttachment = anexo instanceof File && anexo.size > 0;
  if (!body && !hasAttachment) return;

  const [conv] = await db.select().from(s.whatsappConversations)
    .where(and(eq(s.whatsappConversations.id, conversationId), eq(s.whatsappConversations.workspaceId, user.workspaceId)));
  if (!conv) return;

  // Cria a mensagem primeiro (sem mídia) só pra ter um id — o anexo é salvo
  // nesse id e a mensagem é atualizada em seguida, mesmo padrão do campaignId.
  const [msg] = await db.insert(s.whatsappMessages).values({
    workspaceId: user.workspaceId,
    conversationId,
    direction: "out",
    body: body || (hasAttachment ? "[anexo]" : ""),
    sentBy: user.id,
    status: "queued",
  }).returning();

  let result;
  if (hasAttachment && anexo instanceof File) {
    if (anexo.size > TAMANHO_MAXIMO) {
      await db.update(s.whatsappMessages).set({ status: "failed" }).where(eq(s.whatsappMessages.id, msg.id));
      revalidatePath("/whatsapp");
      return;
    }
    const mediaKind: MediaKind | null = TIPOS_IMAGEM.has(anexo.type) ? "image"
      : TIPOS_VIDEO.has(anexo.type) ? "video"
      : TIPOS_DOCUMENTO.has(anexo.type) ? "document"
      : null;
    if (!mediaKind) {
      await db.update(s.whatsappMessages).set({ status: "failed" }).where(eq(s.whatsappMessages.id, msg.id));
      revalidatePath("/whatsapp");
      return;
    }
    const buffer = Buffer.from(await anexo.arrayBuffer());
    const mediaPath = await salvarMidiaMensagem(msg.id, buffer);
    await db.update(s.whatsappMessages).set({ mediaPath, mediaType: mediaKind, mediaMime: anexo.type })
      .where(eq(s.whatsappMessages.id, msg.id));

    const mediaUrl = `${appInternalUrl()}/api/wa/messages/media/${msg.id}`;
    result = await sendWhatsappMedia(conv.phone, mediaUrl, mediaKind, body || undefined, conv.instancia);
  } else {
    // Responde pelo mesmo número por onde o cliente falou (gestor ou consultor).
    result = await sendWhatsappMessage(conv.phone, body, conv.instancia);
  }

  await db.update(s.whatsappMessages).set({
    status: result.ok ? "sent" : "failed",
    providerMessageId: result.providerMessageId,
  }).where(eq(s.whatsappMessages.id, msg.id));

  await db.update(s.whatsappConversations).set({
    lastMessageAt: new Date(),
    lastMessagePreview: body || "[anexo]",
  }).where(eq(s.whatsappConversations.id, conversationId));

  revalidatePath("/whatsapp");
}

export async function sendTemplateMessage(conversationId: string, templateId: string) {
  const user = await requireUser();
  const [template] = await db.select().from(s.whatsappTemplates)
    .where(and(eq(s.whatsappTemplates.id, templateId), eq(s.whatsappTemplates.workspaceId, user.workspaceId)));
  if (!template) return;

  const fd = new FormData();
  fd.set("body", template.body);
  await sendMessage(conversationId, fd);
}

export async function markConversationRead(conversationId: string) {
  const user = await requireUser();
  await db.update(s.whatsappConversations)
    .set({ unreadCount: 0 })
    .where(and(eq(s.whatsappConversations.id, conversationId), eq(s.whatsappConversations.workspaceId, user.workspaceId)));
  revalidatePath("/whatsapp");
}

export async function assignConversation(conversationId: string, userId: string) {
  const user = await requireUser();
  await db.update(s.whatsappConversations)
    .set({ assignedTo: userId || null })
    .where(and(eq(s.whatsappConversations.id, conversationId), eq(s.whatsappConversations.workspaceId, user.workspaceId)));
  revalidatePath("/whatsapp");
}

export async function setConversationStatus(conversationId: string, status: "open" | "pending" | "closed") {
  const user = await requireUser();
  await db.update(s.whatsappConversations)
    .set({ status })
    .where(and(eq(s.whatsappConversations.id, conversationId), eq(s.whatsappConversations.workspaceId, user.workspaceId)));
  revalidatePath("/whatsapp");
}

export async function startConversation(formData: FormData) {
  const user = await requireUser();
  const contactId = String(formData.get("contactId") ?? "");
  if (!contactId) return;

  const [contact] = await db.select().from(s.contacts)
    .where(and(eq(s.contacts.id, contactId), eq(s.contacts.workspaceId, user.workspaceId)));
  if (!contact?.phone) return;

  const existing = await db.select().from(s.whatsappConversations)
    .where(and(eq(s.whatsappConversations.workspaceId, user.workspaceId), eq(s.whatsappConversations.phone, contact.phone)));

  if (existing.length === 0) {
    await db.insert(s.whatsappConversations).values({
      workspaceId: user.workspaceId,
      contactId: contact.id,
      companyId: contact.companyId,
      phone: contact.phone,
      contactName: contact.name,
      assignedTo: user.id,
      lastMessagePreview: "Conversa iniciada.",
    });
  }

  revalidatePath("/whatsapp");
}

// Encontra (ou cria) a conversa do contato de uma oportunidade e vincula os dois.
export async function findOrCreateConversationForOpportunity(opportunityId: string): Promise<string | null> {
  const user = await requireUser();

  const [opp] = await db.select().from(s.opportunities)
    .where(and(eq(s.opportunities.id, opportunityId), eq(s.opportunities.workspaceId, user.workspaceId)));
  if (!opp?.primaryContactId) return null;

  const [contact] = await db.select().from(s.contacts).where(eq(s.contacts.id, opp.primaryContactId));
  if (!contact?.phone) return null;

  let [conv] = await db.select().from(s.whatsappConversations)
    .where(and(eq(s.whatsappConversations.workspaceId, user.workspaceId), eq(s.whatsappConversations.phone, contact.phone)));

  if (!conv) {
    [conv] = await db.insert(s.whatsappConversations).values({
      workspaceId: user.workspaceId,
      contactId: contact.id,
      companyId: contact.companyId,
      opportunityId: opp.id,
      phone: contact.phone,
      contactName: contact.name,
      assignedTo: user.id,
      lastMessagePreview: "Conversa iniciada a partir da oportunidade.",
    }).returning();
  } else if (!conv.opportunityId) {
    await db.update(s.whatsappConversations).set({ opportunityId: opp.id }).where(eq(s.whatsappConversations.id, conv.id));
  }

  return conv.id;
}

export async function openWhatsappForOpportunity(opportunityId: string) {
  const convId = await findOrCreateConversationForOpportunity(opportunityId);
  redirect(convId ? `/whatsapp?c=${convId}` : "/whatsapp");
}

export async function listConversationMessages(conversationId: string) {
  const user = await requireUser();
  return db.select().from(s.whatsappMessages)
    .where(and(eq(s.whatsappMessages.conversationId, conversationId), eq(s.whatsappMessages.workspaceId, user.workspaceId)))
    .orderBy(desc(s.whatsappMessages.createdAt));
}

/**
 * Salva a config do bot/follow-up (lib/followupConfig.ts) em
 * `workspaces.settings.followup`. Só gestor — é ele quem controla o número com
 * bot e as mensagens automáticas (definição de negócio).
 */
export async function salvarFollowupConfig(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "view_team_dashboard")) redirect("/whatsapp");

  const texto = (campo: string) => String(formData.get(campo) ?? "").trim();
  const followup = {
    instanciaGestor: texto("instanciaGestor"),
    mensagemRetomada: texto("mensagemRetomada"),
    mensagem30Dias: texto("mensagem30Dias"),
    usarIaNaRetomada: formData.get("usarIaNaRetomada") === "on",
    instrucaoIa: texto("instrucaoIa"),
  };
  if (!followup.instanciaGestor || !followup.mensagemRetomada || !followup.mensagem30Dias) {
    redirect("/whatsapp/follow-up?erro=Preencha+o+n%C3%BAmero+do+gestor+e+as+duas+mensagens");
  }

  const [ws] = await db.select({ settings: s.workspaces.settings }).from(s.workspaces).where(eq(s.workspaces.id, user.workspaceId));
  const settings = { ...((ws?.settings as Record<string, unknown>) ?? {}), followup };
  await db.update(s.workspaces).set({ settings }).where(eq(s.workspaces.id, user.workspaceId));

  revalidatePath("/whatsapp/follow-up");
  redirect("/whatsapp/follow-up?ok=1");
}
