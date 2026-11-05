import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";

// Confirma o resultado do envio de UM destinatario de campanha.
// Body: { recipientId, providerMessageId?, error? }
export async function POST(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const recipientId = String(body?.recipientId ?? "").trim();
  if (!recipientId) {
    return NextResponse.json({ ok: false, error: "recipientId required" }, { status: 400 });
  }
  const failed = body?.error != null && String(body.error).trim() !== "";

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  await db.update(s.campaignRecipients).set({
    status: failed ? "failed" : "sent",
    error: failed ? String(body.error) : null,
    providerMessageId: body?.providerMessageId ? String(body.providerMessageId) : null,
    sentAt: new Date(),
  }).where(and(
    eq(s.campaignRecipients.workspaceId, workspace.id),
    eq(s.campaignRecipients.id, recipientId),
  ));

  return NextResponse.json({ ok: true });
}
