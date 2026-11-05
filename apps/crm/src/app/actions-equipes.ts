"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";

/**
 * Cadastro de equipes (Equipe e acessos). A gestão (quem vê o dashboard e
 * edita registros) cria, edita e exclui. Integrantes e líder só podem ser
 * pessoas do workspace; o líder entra como integrante automaticamente.
 */

const UUID = /^[0-9a-f-]{36}$/i;

async function exigirGestao() {
  const user = await requireUser();
  if (!can(user.role, "view_team_dashboard") || !can(user.role, "manage_records")) throw new Error("FORBIDDEN");
  return user;
}

function revalidar() {
  revalidatePath("/equipe");
  revalidatePath("/relatorios");
}

/** Cria (sem `id`) ou atualiza (com `id`) uma equipe. */
export async function salvarEquipe(formData: FormData): Promise<void> {
  const user = await exigirGestao();
  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 60);
  const liderBruto = String(formData.get("liderId") ?? "");
  const pedidos = [...new Set(formData.getAll("membros").map(String).filter((v) => UUID.test(v)))];
  if (!nome) throw new Error("Dê um nome à equipe.");
  if (id && !UUID.test(id)) throw new Error("Equipe inválida.");

  const liderId = UUID.test(liderBruto) ? liderBruto : null;
  const candidatos = [...new Set([...pedidos, ...(liderId ? [liderId] : [])])];
  // Só gente do workspace — o formulário não decide quem existe.
  const validos = candidatos.length
    ? (await db.select({ id: s.workspaceMembers.userId }).from(s.workspaceMembers)
        .where(and(eq(s.workspaceMembers.workspaceId, user.workspaceId), inArray(s.workspaceMembers.userId, candidatos)))).map((r) => r.id)
    : [];
  const lider = liderId && validos.includes(liderId) ? liderId : null;

  const repetido = await db.select({ id: s.equipes.id }).from(s.equipes)
    .where(and(eq(s.equipes.workspaceId, user.workspaceId), eq(s.equipes.nome, nome), id ? ne(s.equipes.id, id) : undefined));
  if (repetido.length) throw new Error(`Já existe uma equipe chamada "${nome}".`);

  await db.transaction(async (tx) => {
    let equipeId = id;
    if (id) {
      const atualizada = await tx.update(s.equipes).set({ nome, liderId: lider, updatedAt: new Date() })
        .where(and(eq(s.equipes.id, id), eq(s.equipes.workspaceId, user.workspaceId))).returning({ id: s.equipes.id });
      if (!atualizada.length) throw new Error("Equipe não encontrada.");
      await tx.delete(s.equipeMembros).where(eq(s.equipeMembros.equipeId, id));
    } else {
      const [nova] = await tx.insert(s.equipes).values({ workspaceId: user.workspaceId, nome, liderId: lider }).returning({ id: s.equipes.id });
      equipeId = nova.id;
    }
    if (validos.length) await tx.insert(s.equipeMembros).values(validos.map((userId) => ({ equipeId, userId })));
  });
  revalidar();
}

export async function excluirEquipe(formData: FormData): Promise<void> {
  const user = await exigirGestao();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new Error("Equipe inválida.");
  await db.delete(s.equipes).where(and(eq(s.equipes.id, id), eq(s.equipes.workspaceId, user.workspaceId)));
  revalidar();
}
