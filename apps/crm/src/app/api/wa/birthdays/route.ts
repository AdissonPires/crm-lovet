import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";

// Lista contatos que fazem aniversário hoje e ainda não receberam a mensagem
// este ano. O n8n (cron diário) chama isso e dispara a mensagem comemorativa.
// Header: x-webhook-token: <WA_API_TOKEN>
export async function GET(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const year = today.getFullYear();

  const contacts = await db.select().from(s.contacts)
    .where(eq(s.contacts.workspaceId, workspace.id));

  const items = contacts
    .filter((c) => {
      if (!c.birthDate || !c.phone) return false;
      const bd = new Date(c.birthDate);
      return bd.getMonth() + 1 === month && bd.getDate() === day && c.lastBirthdayMessageYear !== year;
    })
    .map((c) => ({ contactId: c.id, phone: c.phone, name: c.name }));

  return NextResponse.json({ ok: true, count: items.length, items });
}
