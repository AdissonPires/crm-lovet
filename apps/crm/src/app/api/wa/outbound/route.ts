import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";

// Registra uma mensagem ENVIADA pelo bot/sistema (via n8n), para o historico
// aparecer na tela de WhatsApp do CRM.
// Body: { conversationId, text, providerMessageId?, mediaType?, sentByAgent? }
export async function POST(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const conversationId = String(body?.conversationId ?? "").trim();
  const text = String(body?.text ?? "").trim();
  if (!conversationId || !text) {
    return NextResponse.json({ ok: false, error: "conversationId and text are required" }, { status: 400 });
  }
  const mediaType = ["text", "image", "document", "audio"].includes(body?.mediaType)
    ? body.mediaType : "text";

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  const [conv] = await db.select().from(s.whatsappConversations)
    .where(and(
      eq(s.whatsappConversations.workspaceId, workspace.id),
      eq(s.whatsappConversations.id, conversationId),
    ));
  if (!conv) return NextResponse.json({ ok: false, error: "conversation not found" }, { status: 404 });

  const now = new Date();
  await db.insert(s.whatsappMessages).values({
    workspaceId: workspace.id,
    conversationId: conv.id,
    direction: "out",
    body: text,
    mediaType,
    sentByAgent: body?.sentByAgent !== false,
    status: "sent",
    providerMessageId: body?.providerMessageId ? String(body.providerMessageId) : null,
  });

  await db.update(s.whatsappConversations).set({
    lastMessageAt: now,
    lastMessagePreview: text,
  }).where(eq(s.whatsappConversations.id, conv.id));

  return NextResponse.json({ ok: true });
}
