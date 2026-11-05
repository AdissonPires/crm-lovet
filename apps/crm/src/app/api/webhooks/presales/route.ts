import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";

// Recebe leads de pré-venda de fora do CRM (n8n, anúncios Meta/Google,
// formulários, etc.). Aponte a automação para:
// https://<seu-dominio>/api/webhooks/presales
// Header obrigatório: x-webhook-token: <PRESALES_WEBHOOK_TOKEN>
// Corpo: { name, phone, email?, channel?, socialNetwork?, notes? }
export async function POST(req: Request) {
  const expectedToken = process.env.PRESALES_WEBHOOK_TOKEN;
  if (!expectedToken || req.headers.get("x-webhook-token") !== expectedToken) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const phone = String(body?.phone ?? "").trim();
  if (!name || !phone) {
    return NextResponse.json({ ok: false, error: "name and phone are required" }, { status: 400 });
  }

  // Assume workspace único no protótipo (mesma ressalva do webhook Evolution)
  const [workspace] = await db.select().from(s.workspaces).limit(1);
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  const channel = ["meta_ads", "google_ads", "social_organic", "prospeccao", "indicacao", "whatsapp", "outro"]
    .includes(body?.channel) ? body.channel : "outro";

  const existing = await db.select().from(s.presalesLeads)
    .where(and(eq(s.presalesLeads.workspaceId, workspace.id), eq(s.presalesLeads.phone, phone)));

  const [lead] = existing.length > 0
    ? existing
    : await db.insert(s.presalesLeads).values({
        workspaceId: workspace.id,
        name,
        phone,
        email: body?.email ? String(body.email) : null,
        channel,
        socialNetwork: body?.socialNetwork ? String(body.socialNetwork) : null,
        notes: body?.notes ? String(body.notes) : null,
      }).returning();

  await db.insert(s.activities).values({
    workspaceId: workspace.id, actorId: null, actorType: "system",
    relatedToType: "presales_lead", relatedToId: lead.id,
    type: "note", payload: { text: existing.length > 0 ? "Novo evento recebido para lead existente." : "Lead recebido via webhook." },
  });

  // Cria a conversa de WhatsApp vinculada (sem requireUser — este endpoint
  // não tem sessão de usuário, é chamado por um sistema externo).
  const [conv] = await db.select().from(s.whatsappConversations)
    .where(and(eq(s.whatsappConversations.workspaceId, workspace.id), eq(s.whatsappConversations.phone, phone)));
  if (!conv) {
    await db.insert(s.whatsappConversations).values({
      workspaceId: workspace.id,
      presalesLeadId: lead.id,
      phone,
      contactName: name,
      lastMessagePreview: "Lead recebido via webhook.",
    });
  } else if (!conv.presalesLeadId) {
    await db.update(s.whatsappConversations).set({ presalesLeadId: lead.id }).where(eq(s.whatsappConversations.id, conv.id));
  }

  return NextResponse.json({ ok: true, leadId: lead.id });
}
