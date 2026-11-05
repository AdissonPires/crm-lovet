import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";

// Alterna o atendimento entre bot ("auto") e humano ("human").
// Em "human" a conversa vai para a fila "pending" (um vendedor assume) e o bot
// para de responder. Em "auto" o bot volta a responder e a conversa reabre.
// Body: { conversationId, mode: "auto" | "human" }
export async function POST(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const conversationId = String(body?.conversationId ?? "").trim();
  const mode = body?.mode === "human" ? "human" : body?.mode === "auto" ? "auto" : null;
  if (!conversationId || !mode) {
    return NextResponse.json({ ok: false, error: "conversationId and mode (auto|human) required" }, { status: 400 });
  }

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  const [conv] = await db.select().from(s.whatsappConversations)
    .where(and(
      eq(s.whatsappConversations.workspaceId, workspace.id),
      eq(s.whatsappConversations.id, conversationId),
    ));
  if (!conv) return NextResponse.json({ ok: false, error: "conversation not found" }, { status: 404 });

  await db.update(s.whatsappConversations).set({
    botStatus: mode,
    status: mode === "human" ? "pending" : "open",
  }).where(eq(s.whatsappConversations.id, conv.id));

  return NextResponse.json({ ok: true, botStatus: mode });
}
