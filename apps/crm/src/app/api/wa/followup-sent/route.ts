import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";

// Marca que um follow-up foi enviado numa conversa (incrementa o contador e
// registra a data). Chamado pelo n8n depois de disparar a mensagem.
// Body: { conversationId }
export async function POST(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const conversationId = String(body?.conversationId ?? "").trim();
  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "conversationId required" }, { status: 400 });
  }

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  await db.update(s.whatsappConversations).set({
    lastFollowupAt: new Date(),
    followupCount: sql`${s.whatsappConversations.followupCount} + 1`,
  }).where(and(
    eq(s.whatsappConversations.workspaceId, workspace.id),
    eq(s.whatsappConversations.id, conversationId),
  ));

  return NextResponse.json({ ok: true });
}
