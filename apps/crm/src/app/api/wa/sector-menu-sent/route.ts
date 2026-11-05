import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";

/**
 * Marca que o menu de setores foi enviado ao cliente.
 *
 * Passo separado do GET /sectors de propósito: só depois de a mensagem sair de
 * fato é que o estado avança. Se o envio falhar, a conversa continua em "menu"
 * e o menu é tentado de novo na próxima mensagem — em vez de o cliente ficar
 * preso esperando escolher entre opções que nunca chegaram.
 *
 * Body: { conversationId }
 */
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

  await db.update(s.whatsappConversations)
    .set({ flowState: "awaiting_sector" })
    .where(and(
      eq(s.whatsappConversations.workspaceId, workspace.id),
      eq(s.whatsappConversations.id, conversationId),
    ));

  return NextResponse.json({ ok: true });
}
