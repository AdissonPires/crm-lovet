import { NextResponse } from "next/server";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";

/**
 * Recebe uma lista de contatos pronta (o n8n ja fez o parse do TXT/CSV
 * enviado pelo usuario) e joga na fila avulsa do discador, junto com o que
 * for importado direto pela tela em /discador.
 * Header: x-webhook-token: <WA_API_TOKEN>
 * Body: { name?: string, contacts: [{ name?, phone }] }
 */
export async function POST(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const contacts: { name?: string; phone?: string }[] = body?.contacts ?? [];
  const valid = contacts
    .map((c) => ({ name: String(c.name ?? "").trim(), phone: String(c.phone ?? "").trim() }))
    .filter((c) => c.phone);

  if (valid.length === 0) {
    return NextResponse.json({ ok: false, error: "nenhum contato valido" }, { status: 400 });
  }

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  const [batch] = await db.insert(s.dialerImports).values({
    workspaceId: workspace.id,
    name: String(body?.name ?? "").trim() || "Importação via n8n",
    totalContacts: valid.length,
  }).returning();

  await db.insert(s.dialerImportContacts).values(
    valid.map((c) => ({
      importId: batch.id,
      workspaceId: workspace.id,
      name: c.name || c.phone,
      phone: c.phone,
    })),
  );

  return NextResponse.json({ ok: true, batchId: batch.id, total: valid.length });
}
