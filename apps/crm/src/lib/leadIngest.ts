import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getWorkspace } from "@/lib/waApi";
import type { PresalesChannel } from "@/lib/presalesChannels";

export type InboundLead = {
  channel: PresalesChannel;
  socialNetwork?: string | null;
  name: string;
  phone: string;
  email?: string | null;
  city?: string | null;
  notes?: string | null;
};

/**
 * Upsert de lead de pre-venda por telefone, com o canal de origem preenchido
 * automaticamente pelo chamador (cada rota /api/leads/* sabe de onde veio).
 * Mesma logica de upsert que /api/contacts/route.ts ja usa pro WhatsApp,
 * generalizada para qualquer canal de entrada.
 */
export async function upsertInboundLead(input: InboundLead): Promise<{ leadId: string; created: boolean }> {
  const workspace = await getWorkspace();
  if (!workspace) throw new Error("no workspace");

  const phone = input.phone.trim();
  if (!phone) throw new Error("phone is required");
  const name = input.name.trim() || phone;

  const [existing] = await db.select().from(s.presalesLeads)
    .where(and(eq(s.presalesLeads.workspaceId, workspace.id), eq(s.presalesLeads.phone, phone)));

  if (existing) {
    await db.update(s.presalesLeads).set({
      name: existing.name && existing.name !== existing.phone ? existing.name : name,
      email: input.email ?? existing.email,
      city: input.city ?? existing.city,
      notes: input.notes ?? existing.notes,
      updatedAt: new Date(),
    }).where(eq(s.presalesLeads.id, existing.id));
    return { leadId: existing.id, created: false };
  }

  const [lead] = await db.insert(s.presalesLeads).values({
    workspaceId: workspace.id,
    name,
    phone,
    email: input.email ?? null,
    city: input.city ?? null,
    channel: input.channel,
    socialNetwork: input.socialNetwork ?? null,
    notes: input.notes ?? null,
    lastContactAt: new Date(),
    attemptCount: 0,
  }).returning();

  return { leadId: lead.id, created: true };
}
