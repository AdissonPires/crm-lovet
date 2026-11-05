import { and, eq } from "drizzle-orm";
import { shared } from "@lovet/db";
import { db, schema as s } from "@/db";

/** Membros com login ATIVO e papel no CRM — quem de fato consegue entrar e atender. */
export async function idsComLoginAtivoNoCrm(workspaceId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: shared.users.id })
    .from(shared.users)
    .innerJoin(shared.moduleRoles, and(
      eq(shared.moduleRoles.userId, shared.users.id),
      eq(shared.moduleRoles.tenantId, workspaceId),
      eq(shared.moduleRoles.module, "crm"),
    ))
    .where(eq(shared.users.status, "active"));
  return new Set(rows.map((r) => r.id));
}

/**
 * Quem aparece nas listas da plataforma (Equipe, seletores de pessoa, colegas):
 * os membros do workspace que têm login ativo no CRM.
 */
export async function idsMembrosDaPlataforma(workspaceId: string): Promise<Set<string>> {
  const [membros, comLogin] = await Promise.all([
    db.select({ userId: s.workspaceMembers.userId })
      .from(s.workspaceMembers)
      .where(eq(s.workspaceMembers.workspaceId, workspaceId)),
    idsComLoginAtivoNoCrm(workspaceId),
  ]);
  return new Set(membros.filter((m) => comLogin.has(m.userId)).map((m) => m.userId));
}
