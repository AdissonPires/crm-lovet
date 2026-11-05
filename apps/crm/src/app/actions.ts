"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { verifyCredentials, createSession, destroySession, SESSION_COOKIE } from "@lovet/auth";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { limparCacheDadosAgora } from "@/lib/cache-dados";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 dias, mesma janela da sessao no banco

/**
 * Erro de login vai por query string, nao por cookie: a pagina de login e a
 * unica tela sem sessao, e um redirect com ?erro=... resolve sem precisar de
 * mais um mecanismo.
 */
export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("password") ?? "");

  if (!email || !senha) {
    redirect(`/login?erro=${encodeURIComponent("Informe e-mail e senha.")}`);
  }

  const userId = await verifyCredentials(db, email, senha);
  if (!userId) {
    // Mensagem generica de proposito: nao revela se o problema foi o e-mail
    // ou a senha, o que ajudaria alguem tentando adivinhar uma conta valida.
    redirect(`/login?erro=${encodeURIComponent("E-mail ou senha incorretos.")}`);
  }

  const token = await createSession(db, userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    // NODE_ENV=production nao significa "servido por HTTPS" — este deploy
    // roda atras de HTTP puro (sem TLS na frente). O Chrome trata localhost
    // como origem segura mesmo sem HTTPS e deixa passar; o Safari NAO tem essa
    // excecao e recusa reenviar um cookie Secure em http://, entao a sessao
    // morria silenciosamente a cada navegacao nova (o layout ja montado no
    // React continuava mostrando o usuario logado, so a pagina nova falhava).
    // So vira true com TLS de verdade na frente (setar COOKIE_SECURE=true).
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: SESSION_MAX_AGE,
  });

  redirect("/");
}

export async function logout() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  await destroySession(db, token);
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function moveOpportunityStage(opportunityId: string, toStageId: string) {
  const user = await requireUser();

  const [opp] = await db.select().from(s.opportunities)
    .where(and(eq(s.opportunities.id, opportunityId), eq(s.opportunities.workspaceId, user.workspaceId)));
  if (!opp || opp.stageId === toStageId) return;

  const [toStage] = await db.select().from(s.pipelineStages).where(eq(s.pipelineStages.id, toStageId));
  if (!toStage) return;

  const timeInStage = Math.floor((Date.now() - new Date(opp.stageEnteredAt).getTime()) / 1000);
  const status = toStage.isWon ? "won" : toStage.isLost ? "lost" : "open";

  await db.update(s.opportunities).set({
    stageId: toStageId,
    status,
    closedAt: status === "open" ? null : new Date(),
    stageEnteredAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(s.opportunities.id, opportunityId));

  await db.insert(s.opportunityStageHistory).values({
    opportunityId, fromStageId: opp.stageId, toStageId,
    changedBy: user.id, timeInStageSeconds: timeInStage,
  });

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "opportunity", relatedToId: opportunityId,
    type: "stage_changed", payload: { to: toStage.name },
  });

  // Ganhar NÃO cria projeto de instalação (workflow do CRM solar, não usado aqui).

  revalidatePath("/pipeline");
  revalidatePath("/projetos");
  revalidatePath(`/oportunidades/${opportunityId}`);
}

export async function moveInstallationStage(projectId: string, toStageId: string) {
  const user = await requireUser();
  const [proj] = await db.select().from(s.installationProjects)
    .where(and(eq(s.installationProjects.id, projectId), eq(s.installationProjects.workspaceId, user.workspaceId)));
  if (!proj || proj.stageId === toStageId) return;

  const [toStage] = await db.select().from(s.pipelineStages).where(eq(s.pipelineStages.id, toStageId));
  if (!toStage) return;

  await db.update(s.installationProjects).set({
    stageId: toStageId,
    stageEnteredAt: new Date(),
    installationCompletedAt: toStage.isWon ? new Date() : proj.installationCompletedAt,
    warrantyStartDate: toStage.isWon ? new Date() : proj.warrantyStartDate,
  }).where(eq(s.installationProjects.id, projectId));

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "opportunity", relatedToId: proj.opportunityId,
    type: "installation_stage_changed", payload: { to: toStage.name },
  });

  revalidatePath("/projetos");
  revalidatePath(`/oportunidades/${proj.opportunityId}`);
}

export async function addNote(opportunityId: string, text: string) {
  const user = await requireUser();
  if (!text.trim()) return;
  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "opportunity", relatedToId: opportunityId,
    type: "note", payload: { text: text.trim() },
  });
  revalidatePath(`/oportunidades/${opportunityId}`);
}

export async function toggleTask(taskId: string) {
  const user = await requireUser();
  const [task] = await db.select().from(s.tasks)
    .where(and(eq(s.tasks.id, taskId), eq(s.tasks.workspaceId, user.workspaceId)));
  if (!task) return;
  await db.update(s.tasks).set({
    completedAt: task.completedAt ? null : new Date(),
  }).where(eq(s.tasks.id, taskId));
  revalidatePath("/tarefas");
  revalidatePath("/");
  limparCacheDadosAgora();
}

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const opportunityId = String(formData.get("opportunityId") ?? "") || null;
  const dueAt = String(formData.get("dueAt") ?? "");
  await db.insert(s.tasks).values({
    workspaceId: user.workspaceId,
    relatedToType: opportunityId ? "opportunity" : null,
    relatedToId: opportunityId,
    assigneeId: user.id, createdBy: user.id,
    type: (String(formData.get("type") ?? "todo") as "call" | "email" | "meeting" | "visit" | "todo"),
    title,
    dueAt: dueAt ? new Date(dueAt) : null,
  });
  revalidatePath("/tarefas");
  if (opportunityId) revalidatePath(`/oportunidades/${opportunityId}`);
}
