"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { normalizePhone } from "@/lib/whatsapp";
import { salvarMidiaCampanha, TAMANHO_MAXIMO, TIPOS_IMAGEM, TIPOS_VIDEO } from "@/lib/storage";

// Cria uma campanha (rascunho) e monta a lista de destinatarios a partir da
// audiencia escolhida (todos os contatos ou todos os leads de pre-venda).
export async function createCampaign(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) throw new Error("FORBIDDEN");

  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const audience = String(formData.get("audience") ?? "contatos");
  if (!name || !body) return;

  const [camp] = await db.insert(s.campaigns).values({
    workspaceId: user.workspaceId,
    name,
    body,
    status: "draft",
    createdBy: user.id,
  }).returning();

  // Mídia opcional (imagem ou vídeo) pra ir junto com a mensagem.
  const midia = formData.get("midia");
  if (midia instanceof File && midia.size > 0) {
    if (midia.size > TAMANHO_MAXIMO) throw new Error("Arquivo maior que 20MB.");
    const mediaType = TIPOS_IMAGEM.has(midia.type) ? "image" : TIPOS_VIDEO.has(midia.type) ? "video" : null;
    if (!mediaType) throw new Error("Formato não aceito. Use JPEG, PNG, WEBP (imagem) ou MP4, MOV, WEBM (vídeo).");

    const buffer = Buffer.from(await midia.arrayBuffer());
    const mediaPath = await salvarMidiaCampanha(camp.id, buffer);
    await db.update(s.campaigns).set({ mediaPath, mediaType, mediaMime: midia.type }).where(eq(s.campaigns.id, camp.id));
  }

  // Monta os destinatarios (dedup por telefone normalizado).
  const seen = new Set<string>();
  const rows: { campaignId: string; workspaceId: string; contactId?: string; phone: string; name: string }[] = [];

  if (audience === "leads") {
    const leads = await db.select().from(s.presalesLeads)
      .where(and(eq(s.presalesLeads.workspaceId, user.workspaceId), isNotNull(s.presalesLeads.phone)));
    for (const l of leads) {
      const phone = normalizePhone(l.phone);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      rows.push({ campaignId: camp.id, workspaceId: user.workspaceId, phone, name: l.name });
    }
  } else {
    const contacts = await db.select().from(s.contacts)
      .where(and(eq(s.contacts.workspaceId, user.workspaceId), isNotNull(s.contacts.phone)));
    for (const c of contacts) {
      const phone = normalizePhone(c.phone ?? "");
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      rows.push({ campaignId: camp.id, workspaceId: user.workspaceId, contactId: c.id, phone, name: c.name });
    }
  }

  if (rows.length > 0) await db.insert(s.campaignRecipients).values(rows);

  revalidatePath("/campanhas");
  redirect("/campanhas");
}

export async function startCampaign(campaignId: string) {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) throw new Error("FORBIDDEN");
  await db.update(s.campaigns).set({ status: "running" })
    .where(and(eq(s.campaigns.id, campaignId), eq(s.campaigns.workspaceId, user.workspaceId)));
  revalidatePath("/campanhas");
}

export async function pauseCampaign(campaignId: string) {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) throw new Error("FORBIDDEN");
  await db.update(s.campaigns).set({ status: "paused" })
    .where(and(eq(s.campaigns.id, campaignId), eq(s.campaigns.workspaceId, user.workspaceId)));
  revalidatePath("/campanhas");
}
