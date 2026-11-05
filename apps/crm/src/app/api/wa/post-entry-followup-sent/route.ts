import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";

// Chamado pelo n8n depois de mandar a mensagem de engajamento de 30 dias.
// Marca o envio (nunca repete) E cria o "card de acompanhamento" — uma tarefa
// pro dono do lead revisar o retorno do cliente — porque o pedido do negócio
// foi "cards de acompanhamento / mensagens", os dois, não só a mensagem.
// Body: { leadId }
export async function POST(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const leadId = String(body?.leadId ?? "").trim();
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "leadId required" }, { status: 400 });
  }

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  const [lead] = await db.select().from(s.presalesLeads)
    .where(and(eq(s.presalesLeads.workspaceId, workspace.id), eq(s.presalesLeads.id, leadId)));
  if (!lead) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });

  await db.update(s.presalesLeads)
    .set({ postEntryFollowupSentAt: new Date() })
    .where(eq(s.presalesLeads.id, leadId));

  await db.insert(s.tasks).values({
    workspaceId: workspace.id,
    relatedToType: "presales_lead",
    relatedToId: leadId,
    assigneeId: lead.ownerId,
    createdBy: lead.ownerId,
    type: "todo",
    title: `Acompanhar ${lead.name} — 30 dias desde a entrada`,
    dueAt: new Date(),
    createdByAgent: true,
  });

  await db.insert(s.activities).values({
    workspaceId: workspace.id, actorId: null, actorType: "system",
    relatedToType: "presales_lead", relatedToId: leadId,
    type: "note", payload: { text: "Follow-up de 30 dias enviado e card de acompanhamento criado." },
  });

  return NextResponse.json({ ok: true });
}
