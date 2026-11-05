import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";

// Recebe uma mensagem ENTRANTE do WhatsApp (via n8n). Faz upsert da conversa,
// registra a mensagem e devolve o estado que o n8n precisa para decidir se o
// bot responde: botStatus (auto/human), se ha vendedor atribuido e o historico.
// Header: x-webhook-token: <WA_API_TOKEN>
// Body: { phone, name?, text, mediaType?, providerMessageId?, instancia? }
// `instancia` = por qual número (instância da Evolution) a mensagem chegou. Se
// é número de CONSULTOR (whatsapp_instances.userId), a conversa fica com ele e
// em atendimento humano — só o número do gestor tem bot (regra de negócio).
export async function POST(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const phone = String(body?.phone ?? "").trim();
  const text = String(body?.text ?? "").trim();
  if (!phone || !text) {
    return NextResponse.json({ ok: false, error: "phone and text are required" }, { status: 400 });
  }
  const name = String(body?.name ?? "").trim() || phone;
  const mediaType = ["text", "image", "document", "audio"].includes(body?.mediaType)
    ? body.mediaType : "text";

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  // Vincula a um contato existente (se houver) pelo telefone.
  const [contact] = await db.select().from(s.contacts)
    .where(and(eq(s.contacts.workspaceId, workspace.id), eq(s.contacts.phone, phone)));

  let [conv] = await db.select().from(s.whatsappConversations)
    .where(and(eq(s.whatsappConversations.workspaceId, workspace.id), eq(s.whatsappConversations.phone, phone)));

  const instancia = typeof body?.instancia === "string" && body.instancia.trim() ? body.instancia.trim() : null;
  const [numero] = instancia
    ? await db.select({ userId: s.whatsappInstances.userId }).from(s.whatsappInstances)
      .where(and(eq(s.whatsappInstances.workspaceId, workspace.id), eq(s.whatsappInstances.nome, instancia)))
    : [];
  const doConsultor = numero?.userId
    ? { assignedTo: numero.userId, botStatus: "human" as const }
    : {};

  const now = new Date();
  if (!conv) {
    [conv] = await db.insert(s.whatsappConversations).values({
      workspaceId: workspace.id,
      contactId: contact?.id,
      companyId: contact?.companyId,
      phone,
      contactName: contact?.name ?? name,
      lastMessagePreview: text,
      lastMessageAt: now,
      lastInboundAt: now,
      unreadCount: 1,
      ...(instancia ? { instancia } : {}),
      ...doConsultor,
    }).returning();
  } else {
    await db.update(s.whatsappConversations).set({
      lastMessageAt: now,
      lastInboundAt: now,
      lastMessagePreview: text,
      unreadCount: conv.unreadCount + 1,
      contactId: conv.contactId ?? contact?.id,
      ...(instancia ? { instancia } : {}),
      ...doConsultor,
    }).where(eq(s.whatsappConversations.id, conv.id));
    conv = { ...conv, ...(instancia ? { instancia } : {}), ...doConsultor };
  }

  await db.insert(s.whatsappMessages).values({
    workspaceId: workspace.id,
    conversationId: conv.id,
    direction: "in",
    body: text,
    mediaType,
    providerMessageId: body?.providerMessageId ? String(body.providerMessageId) : null,
  });

  const history = await db.select().from(s.whatsappMessages)
    .where(eq(s.whatsappMessages.conversationId, conv.id))
    .orderBy(asc(s.whatsappMessages.createdAt));

  // Setor já escolhido: a persona vai junto para o bot não precisar de uma
  // segunda chamada só para descobrir com que voz responder.
  let sector: { id: string; name: string; aiPersona: string | null } | null = null;
  if (conv.serviceSectorId) {
    const [sec] = await db
      .select({ id: s.serviceSectors.id, name: s.serviceSectors.name, aiPersona: s.serviceSectors.aiPersona })
      .from(s.serviceSectors)
      .where(eq(s.serviceSectors.id, conv.serviceSectorId));
    sector = sec ?? null;
  }

  return NextResponse.json({
    ok: true,
    conversationId: conv.id,
    botStatus: conv.botStatus,
    flowState: conv.flowState,
    sector,
    assigned: !!conv.assignedTo,
    contactName: conv.contactName,
    history: history.slice(-10).map((m) => ({ direction: m.direction, body: m.body })),
  });
}
