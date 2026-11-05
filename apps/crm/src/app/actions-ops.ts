"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";

const soKinds = ["installation", "maintenance", "inspection", "repair", "survey"] as const;
type SoKind = (typeof soKinds)[number];
const soPriorities = ["low", "normal", "high", "urgent"] as const;
type SoPriority = (typeof soPriorities)[number];

export async function createServiceOrder(formData: FormData) {
  const user = await requireUser();
  const description = String(formData.get("description") ?? "").trim();
  const companyId = String(formData.get("companyId") ?? "") || null;
  if (!description) return;

  const kindRaw = String(formData.get("kind") ?? "installation");
  const kind: SoKind = soKinds.includes(kindRaw as SoKind) ? (kindRaw as SoKind) : "installation";
  const prioRaw = String(formData.get("priority") ?? "normal");
  const priority: SoPriority = soPriorities.includes(prioRaw as SoPriority) ? (prioRaw as SoPriority) : "normal";

  // Site derivado da empresa, se houver
  let siteId: string | null = null;
  if (companyId) {
    const [site] = await db.select().from(s.sites)
      .where(and(eq(s.sites.workspaceId, user.workspaceId), eq(s.sites.companyId, companyId))).limit(1);
    siteId = site?.id ?? null;
  }

  // Numeração sequencial OS-YYYY-NNNN
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(s.serviceOrders)
    .where(eq(s.serviceOrders.workspaceId, user.workspaceId));
  const number = `OS-${new Date().getFullYear()}-${String(Number(count) + 1).padStart(4, "0")}`;

  const checklist = String(formData.get("checklist") ?? "")
    .split("\n").map((l) => l.trim()).filter(Boolean)
    .map((item) => ({ item, done: false }));

  const scheduledAt = String(formData.get("scheduledAt") ?? "");

  await db.insert(s.serviceOrders).values({
    workspaceId: user.workspaceId,
    number,
    kind,
    companyId,
    siteId,
    technicianId: String(formData.get("technicianId") ?? "") || null,
    priority,
    status: "scheduled",
    description,
    checklist,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
  });

  revalidatePath("/operacoes");
  revalidatePath("/campo");
  redirect("/operacoes");
}

export async function advanceServiceOrder(orderId: string) {
  const user = await requireUser();
  const [o] = await db.select().from(s.serviceOrders)
    .where(and(eq(s.serviceOrders.id, orderId), eq(s.serviceOrders.workspaceId, user.workspaceId)));
  if (!o) return;

  const next = o.status === "scheduled" ? "in_progress" : o.status === "in_progress" ? "done" : null;
  if (!next) return;

  await db.update(s.serviceOrders).set({
    status: next,
    startedAt: next === "in_progress" ? new Date() : o.startedAt,
    completedAt: next === "done" ? new Date() : o.completedAt,
  }).where(eq(s.serviceOrders.id, orderId));

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "service_order", relatedToId: orderId,
    type: "service_order_status", payload: { to: next, number: o.number },
  });

  revalidatePath("/operacoes");
  revalidatePath("/campo");
}
