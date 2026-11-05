import { NextResponse } from "next/server";
import { and, eq, gte, isNull, lt, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";
import { lerFollowupConfig, renderizarMensagem } from "@/lib/followupConfig";

// Lista leads que entraram no sistema há exatamente 30 dias e ainda não
// receberam o follow-up pós-entrada. Janela de 1 dia (30 a 31 dias atrás) pra
// funcionar com um cron diário sem repetir. Não manda pra quem já foi
// descartado (incompatível) — mandaria engajamento pra quem já disse não.
// Header: x-webhook-token: <WA_API_TOKEN>
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  const from = new Date(Date.now() - 31 * DAY_MS);
  const to = new Date(Date.now() - 30 * DAY_MS);

  const leads = await db.select().from(s.presalesLeads).where(and(
    eq(s.presalesLeads.workspaceId, workspace.id),
    gte(s.presalesLeads.createdAt, from),
    lt(s.presalesLeads.createdAt, to),
    isNull(s.presalesLeads.postEntryFollowupSentAt),
    ne(s.presalesLeads.status, "incompativel"),
  ));

  // Mensagem e instância (número do gestor) da config editável pelo gestor — ver lib/followupConfig.ts.
  const config = lerFollowupConfig(workspace.settings);
  const items = leads.map((l) => ({
    leadId: l.id, phone: l.phone, name: l.name, ownerId: l.ownerId,
    mensagem: renderizarMensagem(config.mensagem30Dias, l.name),
  }));
  return NextResponse.json({ ok: true, count: items.length, items, instancia: config.instanciaGestor });
}
