import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";

// Marca que a mensagem de aniversário foi enviada a um contato neste ano —
// evita reenviar se o cron rodar de novo no mesmo dia. Body: { contactId }
export async function POST(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const contactId = String(body?.contactId ?? "").trim();
  if (!contactId) {
    return NextResponse.json({ ok: false, error: "contactId required" }, { status: 400 });
  }

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  await db.update(s.contacts)
    .set({ lastBirthdayMessageYear: new Date().getFullYear() })
    .where(and(eq(s.contacts.workspaceId, workspace.id), eq(s.contacts.id, contactId)));

  return NextResponse.json({ ok: true });
}
