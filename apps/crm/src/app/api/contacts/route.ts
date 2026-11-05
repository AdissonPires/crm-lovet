import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";

// Salva/atualiza um CONTATO no CRM a partir de um sistema externo (n8n).
// Faz upsert por telefone e cria/atualiza um lead de pre-venda (canal whatsapp),
// guardando cidade e valor da conta de luz quando informados.
// Header: x-webhook-token: <WA_API_TOKEN>
// Body: { phone, name?, email?, city?, bill?, qualified? }
export async function POST(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const phone = String(body?.phone ?? "").trim();
  if (!phone) {
    return NextResponse.json({ ok: false, error: "phone is required" }, { status: 400 });
  }
  const name = String(body?.name ?? "").trim() || phone;
  const email = body?.email ? String(body.email).trim() : null;
  const city = body?.city ? String(body.city).trim() : null;
  const bill = body?.bill != null && String(body.bill).trim() !== "" ? String(body.bill).trim() : null;
  const qualified = body?.qualified === true;

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  // ── Upsert do contato (por telefone) ──────────────────────────────────────
  const [existing] = await db.select().from(s.contacts)
    .where(and(eq(s.contacts.workspaceId, workspace.id), eq(s.contacts.phone, phone)));

  const extra: Record<string, unknown> = {};
  if (city) extra.city = city;
  if (bill) extra.contaLuz = bill;

  let contactId: string;
  if (existing) {
    contactId = existing.id;
    const mergedCustom = { ...(existing.customFields as Record<string, unknown>), ...extra };
    await db.update(s.contacts).set({
      name: existing.name && existing.name !== existing.phone ? existing.name : name,
      email: email ?? existing.email,
      customFields: mergedCustom,
      updatedAt: new Date(),
    }).where(eq(s.contacts.id, existing.id));
  } else {
    const [c] = await db.insert(s.contacts).values({
      workspaceId: workspace.id,
      name,
      phone,
      email,
      customFields: extra,
    }).returning();
    contactId = c.id;
  }

  // ── Upsert do lead de pre-venda (canal whatsapp) ──────────────────────────
  const notes = [city ? `Cidade: ${city}` : null, bill ? `Conta de luz: ${bill}` : null]
    .filter(Boolean).join(" | ") || null;
  const classification = qualified ? "morno" : null;

  const [existingLead] = await db.select().from(s.presalesLeads)
    .where(and(eq(s.presalesLeads.workspaceId, workspace.id), eq(s.presalesLeads.phone, phone)));

  // O bot conversou com o cliente, então já houve contato. "qualified" (cidade
  // + conta informadas) leva o lead para a coleta de fatura — a entrega ao
  // vendedor ainda exige consumo em kWh, distribuidora e fatura, conferidos
  // pelo SDR (ver src/lib/presalesFunnel.ts).
  const now = new Date();
  let leadId: string;
  if (existingLead) {
    leadId = existingLead.id;
    const advance = qualified && existingLead.status !== "aguardando_vendedor" && existingLead.status !== "convertido";
    await db.update(s.presalesLeads).set({
      name: existingLead.name && existingLead.name !== existingLead.phone ? existingLead.name : name,
      email: email ?? existingLead.email,
      city: city ?? existingLead.city,
      classification: classification ?? existingLead.classification,
      status: advance ? "qualificacao" : existingLead.status,
      stageEnteredAt: advance ? now : existingLead.stageEnteredAt,
      lastContactAt: now,
      notes: notes ?? existingLead.notes,
      updatedAt: now,
    }).where(eq(s.presalesLeads.id, existingLead.id));
  } else {
    const [l] = await db.insert(s.presalesLeads).values({
      workspaceId: workspace.id,
      name,
      phone,
      email,
      city,
      channel: "whatsapp",
      classification,
      status: qualified ? "qualificacao" : "em_contato",
      lastContactAt: now,
      attemptCount: 1,
      notes,
    }).returning();
    leadId = l.id;
  }

  // Vincula contato/lead a conversa de WhatsApp, se existir.
  const [conv] = await db.select().from(s.whatsappConversations)
    .where(and(eq(s.whatsappConversations.workspaceId, workspace.id), eq(s.whatsappConversations.phone, phone)));
  if (conv) {
    await db.update(s.whatsappConversations).set({
      contactId: conv.contactId ?? contactId,
      presalesLeadId: conv.presalesLeadId ?? leadId,
    }).where(eq(s.whatsappConversations.id, conv.id));
  }

  return NextResponse.json({ ok: true, contactId, leadId });
}
