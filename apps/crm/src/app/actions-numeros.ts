"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { lerFollowupConfig } from "@/lib/followupConfig";
import { criarNumero, removerNumero } from "@/lib/whatsapp";

/**
 * Números de WhatsApp dos consultores (regra: bot só no número do
 * gestor; consultor atende manualmente pelo próprio número). Gestor conecta de
 * qualquer consultor; consultor só o próprio.
 */
function slug(nome: string): string {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export async function conectarNumeroConsultor(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "use_whatsapp")) redirect("/");
  const gestor = can(user.role, "view_team_dashboard");
  const userId = gestor ? String(formData.get("userId") ?? "") : user.id;
  if (!userId) redirect("/whatsapp/numeros?erro=Escolha+o+consultor");

  const [pessoa] = await db.select({ id: s.users.id, nome: s.users.name }).from(s.users)
    .innerJoin(s.workspaceMembers, eq(s.workspaceMembers.userId, s.users.id))
    .where(and(eq(s.users.id, userId), eq(s.workspaceMembers.workspaceId, user.workspaceId)));
  if (!pessoa) redirect("/whatsapp/numeros?erro=Consultor+n%C3%A3o+encontrado");

  const [jaTem] = await db.select({ nome: s.whatsappInstances.nome }).from(s.whatsappInstances)
    .where(and(eq(s.whatsappInstances.workspaceId, user.workspaceId), eq(s.whatsappInstances.userId, userId)));
  if (jaTem) redirect(`/whatsapp/numeros?qr=${encodeURIComponent(jaTem.nome)}`);

  const nome = `consultor-${slug(pessoa.nome)}`;
  const [ws] = await db.select({ settings: s.workspaces.settings }).from(s.workspaces).where(eq(s.workspaces.id, user.workspaceId));
  const criado = await criarNumero(nome, lerFollowupConfig(ws?.settings).instanciaGestor);
  if (!criado.ok) redirect(`/whatsapp/numeros?erro=${encodeURIComponent(criado.erro ?? "Falha ao criar o número")}`);

  await db.insert(s.whatsappInstances).values({ workspaceId: user.workspaceId, nome, userId, createdBy: user.id });
  revalidatePath("/whatsapp/numeros");
  redirect(`/whatsapp/numeros?qr=${encodeURIComponent(nome)}`);
}

export async function removerNumeroConsultor(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "use_whatsapp")) redirect("/");
  const id = String(formData.get("id") ?? "");
  const [numero] = await db.select().from(s.whatsappInstances)
    .where(and(eq(s.whatsappInstances.id, id), eq(s.whatsappInstances.workspaceId, user.workspaceId)));
  if (!numero) redirect("/whatsapp/numeros");
  if (!can(user.role, "view_team_dashboard") && numero.userId !== user.id) redirect("/whatsapp/numeros?erro=Sem+permiss%C3%A3o");

  await removerNumero(numero.nome);
  // Conversas desse número passam a sair pelo número padrão (do gestor) — sem isso a resposta falharia.
  await db.update(s.whatsappConversations).set({ instancia: null })
    .where(and(eq(s.whatsappConversations.workspaceId, user.workspaceId), eq(s.whatsappConversations.instancia, numero.nome)));
  await db.delete(s.whatsappInstances).where(eq(s.whatsappInstances.id, numero.id));
  revalidatePath("/whatsapp/numeros");
  redirect("/whatsapp/numeros?ok=removido");
}
