import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { chatbotReply } from "@/lib/ai";
import { sendWhatsappMessage } from "@/lib/whatsapp";

// Recebe eventos do Evolution API (messages.upsert) para mensagens
// recebidas no WhatsApp conectado. Aponte o webhook do Evolution para
// https://<seu-dominio>/api/webhooks/evolution
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || body.event !== "messages.upsert") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const data = body.data;
  if (!data || data.key?.fromMe) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const remoteJid: string | undefined = data.key?.remoteJid;
  const text: string | undefined = data.message?.conversation ?? data.message?.extendedTextMessage?.text;
  const pushName: string | undefined = data.pushName;
  if (!remoteJid || !text) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const phone = remoteJid.replace(/@.*/, "");

  // Assume workspace único no protótipo (multi-tenant real resolveria pelo instance name)
  const [workspace] = await db.select().from(s.workspaces).limit(1);
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  let [conv] = await db.select().from(s.whatsappConversations)
    .where(and(eq(s.whatsappConversations.workspaceId, workspace.id), eq(s.whatsappConversations.phone, phone)));

  if (!conv) {
    const [contact] = await db.select().from(s.contacts)
      .where(and(eq(s.contacts.workspaceId, workspace.id), eq(s.contacts.phone, phone)));

    [conv] = await db.insert(s.whatsappConversations).values({
      workspaceId: workspace.id,
      contactId: contact?.id,
      companyId: contact?.companyId,
      phone,
      contactName: contact?.name ?? pushName ?? phone,
      lastMessagePreview: text,
      unreadCount: 1,
    }).returning();
  } else {
    await db.update(s.whatsappConversations).set({
      lastMessageAt: new Date(),
      lastMessagePreview: text,
      unreadCount: conv.unreadCount + 1,
    }).where(eq(s.whatsappConversations.id, conv.id));
  }

  await db.insert(s.whatsappMessages).values({
    workspaceId: workspace.id,
    conversationId: conv.id,
    direction: "in",
    body: text,
    providerMessageId: data.key?.id,
  });

  // Chatbot: responde na hora conversas sem vendedor atribuído.
  // Desative com WHATSAPP_CHATBOT=off. Erros de IA não bloqueiam o webhook.
  if (process.env.WHATSAPP_CHATBOT !== "off" && !conv.assignedTo) {
    try {
      const history = await db.select().from(s.whatsappMessages)
        .where(eq(s.whatsappMessages.conversationId, conv.id))
        .orderBy(asc(s.whatsappMessages.createdAt));
      const bot = await chatbotReply({
        contactName: conv.contactName,
        history: history.slice(-10).map((m) => ({ direction: m.direction, body: m.body })),
      });
      const sent = await sendWhatsappMessage(conv.phone, bot.reply);
      if (sent.ok) {
        await db.insert(s.whatsappMessages).values({
          workspaceId: workspace.id,
          conversationId: conv.id,
          direction: "out",
          body: bot.reply,
          sentByAgent: true,
          providerMessageId: sent.providerMessageId,
        });
        await db.update(s.whatsappConversations).set({
          lastMessageAt: new Date(),
          lastMessagePreview: bot.reply,
          // Lead qualificado (cidade + conta de luz informadas) vai para a
          // fila "pendente" para um vendedor assumir.
          status: bot.qualified ? "pending" : conv.status,
        }).where(eq(s.whatsappConversations.id, conv.id));
      }
    } catch {
      // IA indisponível (ex.: Ollama parado): mensagem fica para o time responder.
    }
  }

  return NextResponse.json({ ok: true });
}
