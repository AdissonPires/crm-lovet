import { cookies } from "next/headers";
import { loadIdentity, resolveSession, SESSION_COOKIE, type LicenseState } from "@lovet/auth";
import { db } from "@/db";

/**
 * A identidade vem do schema `shared` — comum ao ecossistema — e nao mais das
 * tabelas do CRM.
 *
 * Os nomes `workspaceId` e `workspaceName` foram mantidos de proposito: os
 * UUIDs foram preservados na migracao, entao tenant e workspace sao o mesmo
 * identificador, e o resto do aplicativo segue funcionando sem alteracao.
 * `role` continua sendo o papel NO MODULO crm, que e o que o policy.ts espera.
 */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  workspaceId: string;
  workspaceName: string;
  tenantRole: "owner" | "admin" | "member";
  license: LicenseState;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  // O cookie guarda um token opaco, nao o id do usuario — resolve contra
  // shared.sessions antes de carregar qualquer identidade.
  const userId = await resolveSession(db, token);
  if (!userId) return null;

  const identity = await loadIdentity(db, { userId, module: "crm" });
  if (!identity) return null;

  return {
    id: identity.userId,
    name: identity.name,
    email: identity.email,
    // Sem papel no modulo, o policy.ts nega tudo — e a tela de bloqueio explica.
    role: identity.moduleRole ?? "",
    workspaceId: identity.tenantId,
    workspaceName: identity.tenantName,
    tenantRole: identity.tenantRole,
    license: identity.license,
  };
}

/**
 * Guarda das paginas e server actions. Exige sessao E licenca ativa do modulo.
 *
 * A verificacao precisa estar AQUI, e nao apenas no layout: o React avalia os
 * children antes do layout decidir se os exibe, entao um portao so no layout
 * deixaria a pagina executar — e consultar dados — para quem nao tem licenca.
 * Aqui a falha e fechada.
 *
 * O layout usa getSessionUser (que nao lanca) para mostrar a tela explicativa.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (user.license !== "licensed") throw new Error("MODULE_NOT_LICENSED");
  return user;
}

/** Sessao sem exigir licenca — para o layout renderizar a tela de bloqueio. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
