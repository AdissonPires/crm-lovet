import { NextResponse } from "next/server";
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";
import { lerFollowupConfig, renderizarMensagem } from "@/lib/followupConfig";

// Lista conversas que merecem follow-up: o cliente nao responde ha 3+ dias,
// ainda em atendimento automatico, conversa aberta, no maximo 2 follow-ups, e
// espacando cada follow-up em 3 dias. O n8n (cron) chama isso e dispara.
// A mensagem, a instância (número do gestor) e a opção de IA vêm da config
// editável pelo gestor (lib/followupConfig.ts) — o n8n só envia.
// Header: x-webhook-token: <WA_API_TOKEN>
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_FOLLOWUPS = 2;

export async function GET(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  const cutoff = new Date(Date.now() - THREE_DAYS_MS);

  const convs = await db.select().from(s.whatsappConversations).where(and(
    eq(s.whatsappConversations.workspaceId, workspace.id),
    eq(s.whatsappConversations.botStatus, "auto"),
    eq(s.whatsappConversations.status, "open"),
    lt(s.whatsappConversations.lastInboundAt, cutoff),
    lt(s.whatsappConversations.followupCount, MAX_FOLLOWUPS),
    or(
      isNull(s.whatsappConversations.lastFollowupAt),
      lt(s.whatsappConversations.lastFollowupAt, cutoff),
    ),
  ));

  const config = lerFollowupConfig(workspace.settings);
  const items = [];
  for (const conv of convs) {
    const history = await db.select().from(s.whatsappMessages)
      .where(eq(s.whatsappMessages.conversationId, conv.id))
      .orderBy(asc(s.whatsappMessages.createdAt));
    items.push({
      conversationId: conv.id,
      phone: conv.phone,
      name: conv.contactName,
      followupCount: conv.followupCount,
      mensagem: renderizarMensagem(config.mensagemRetomada, conv.contactName),
      history: history.slice(-10).map((m) => ({ direction: m.direction, body: m.body })),
    });
  }

  return NextResponse.json({
    ok: true, count: items.length, items,
    instancia: config.instanciaGestor,
    usarIa: config.usarIaNaRetomada,
    instrucaoIa: config.instrucaoIa,
  });
}
