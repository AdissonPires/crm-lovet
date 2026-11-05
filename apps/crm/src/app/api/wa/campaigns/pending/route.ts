import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";

// Devolve um LOTE de destinatarios ainda nao enviados de campanhas em execucao.
// O n8n (runner) chama, dispara com intervalo (anti-ban) e confirma cada um em
// /api/wa/campaigns/recipient-sent. Header: x-webhook-token: <WA_API_TOKEN>
const BATCH = 10;

export async function GET(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  const running = await db.select().from(s.campaigns).where(and(
    eq(s.campaigns.workspaceId, workspace.id),
    eq(s.campaigns.status, "running"),
  ));

  const items = [];
  for (const camp of running) {
    if (items.length >= BATCH) break;
    const recipients = await db.select().from(s.campaignRecipients).where(and(
      eq(s.campaignRecipients.campaignId, camp.id),
      eq(s.campaignRecipients.status, "queued"),
    )).limit(BATCH - items.length);

    // Sem mais destinatarios na fila: campanha concluida.
    if (recipients.length === 0) {
      await db.update(s.campaigns).set({ status: "done" }).where(eq(s.campaigns.id, camp.id));
      continue;
    }

    for (const r of recipients) {
      items.push({
        recipientId: r.id,
        campaignId: camp.id,
        phone: r.phone,
        name: r.name,
        text: camp.body.replaceAll("{{nome}}", (r.name || "").split(" ")[0] || r.name || ""),
        mediaType: camp.mediaType,
        // URL interna da rede Docker — o Evolution API busca o arquivo por
        // aqui na hora de montar o sendMedia (não é acessível de fora).
        mediaUrl: camp.mediaPath ? `http://lovet-crm:3000/api/wa/campaigns/media/${camp.id}` : null,
      });
    }
  }

  return NextResponse.json({ ok: true, count: items.length, items });
}
