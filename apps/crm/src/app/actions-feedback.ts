"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";

export async function sendFeedback(formData: FormData) {
  const user = await requireUser();

  const toUserId = String(formData.get("toUserId") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!toUserId || !message) return;

  const [colleague] = await db.select().from(s.workspaceMembers)
    .where(and(eq(s.workspaceMembers.workspaceId, user.workspaceId), eq(s.workspaceMembers.userId, toUserId)));
  if (!colleague) return;

  await db.insert(s.feedbackMessages).values({
    workspaceId: user.workspaceId,
    fromUserId: user.id,
    toUserId,
    message,
  });

  revalidatePath("/feedback");
}

export async function markFeedbackRead(feedbackId: string) {
  const user = await requireUser();

  await db.update(s.feedbackMessages).set({ readAt: new Date() })
    .where(and(
      eq(s.feedbackMessages.id, feedbackId),
      eq(s.feedbackMessages.toUserId, user.id),
      eq(s.feedbackMessages.workspaceId, user.workspaceId),
    ));

  revalidatePath("/feedback");
}
