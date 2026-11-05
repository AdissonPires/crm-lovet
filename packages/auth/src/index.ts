import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { shared } from "@lovet/db";

/** Modulos do ecossistema. */
export type LovetModule = "crm";

/**
 * Cookie de sessao, compartilhado pelos modulos — e o que faz o login unico
 * funcionar: entrar num modulo vale no outro.
 *
 * Guarda um TOKEN OPACO (o `token` de shared.sessions), nunca o id do usuario
 * diretamente. Antes da autenticacao por senha o cookie guardava o proprio id
 * do usuario — qualquer um que editasse o valor no navegador virava outro
 * usuario sem digitar senha nenhuma. Agora o valor sozinho nao diz nada; so
 * autentica quem tem uma linha correspondente, nao expirada, em `sessions`.
 *
 * O nome do cookie vem do CRM antigo. Renomear invalidaria todas as sessoes
 * abertas, entao fica assim ate haver motivo para derrubar todos os logins de
 * uma vez.
 */
export const SESSION_COOKIE = "lovet_uid";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

const scryptAsync = promisify(scrypt);

/**
 * Hash de senha com scrypt (nativo do Node, sem dependencia externa).
 * Formato "salt:hash", ambos em hex, para o verify nao precisar de outro lugar
 * para guardar o salt.
 */
export async function hashPassword(senha: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(senha, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

/**
 * Compara em tempo constante — timingSafeEqual em vez de ===, para o tempo de
 * resposta nao vazar quantos bytes do hash bateram.
 */
export async function verifyPassword(senha: string, armazenado: string | null): Promise<boolean> {
  if (!armazenado) return false;
  const [salt, hashHex] = armazenado.split(":");
  if (!salt || !hashHex) return false;

  const hashArmazenado = Buffer.from(hashHex, "hex");
  const hashTentativa = (await scryptAsync(senha, salt, 64)) as Buffer;

  return hashArmazenado.length === hashTentativa.length && timingSafeEqual(hashArmazenado, hashTentativa);
}

/** Cria uma sessao e devolve o token a gravar no cookie. */
export async function createSession(db: AnyDb, userId: string): Promise<string> {
  const [row] = await db
    .insert(shared.sessions)
    .values({ userId, expiresAt: new Date(Date.now() + SESSION_DURATION_MS) })
    .returning({ token: shared.sessions.token });
  return row.token;
}

/** Resolve o token do cookie para o id do usuario, ou null se invalido/expirado. */
export async function resolveSession(db: AnyDb, token: string | undefined): Promise<string | null> {
  if (!token) return null;
  // UUID invalido nao precisa ir ao banco.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return null;

  const [row] = await db
    .select({ userId: shared.sessions.userId })
    .from(shared.sessions)
    .where(and(eq(shared.sessions.token, token), gt(shared.sessions.expiresAt, new Date())))
    .limit(1);

  return row?.userId ?? null;
}

/** Apaga a sessao no logout — sem isso, o token continuaria valido se vazasse. */
export async function destroySession(db: AnyDb, token: string | undefined) {
  if (!token) return;
  await db.delete(shared.sessions).where(eq(shared.sessions.token, token));
}

/** Autentica por email e senha. Retorna o id do usuario, ou null se invalido. */
export async function verifyCredentials(
  db: AnyDb,
  email: string,
  senha: string,
): Promise<string | null> {
  const [user] = await db
    .select({ id: shared.users.id, passwordHash: shared.users.passwordHash, status: shared.users.status })
    .from(shared.users)
    .where(eq(shared.users.email, email.trim().toLowerCase()))
    .limit(1);

  if (!user || user.status !== "active") return null;
  const ok = await verifyPassword(senha, user.passwordHash);
  return ok ? user.id : null;
}

/** Como o modulo pode ser acessado por este usuario neste tenant. */
export type LicenseState =
  /** Assinatura ativa (ou em teste): pode usar. */
  | "licensed"
  /** Empresa nao contratou o modulo. */
  | "not_subscribed"
  /** Contratou, mas a assinatura esta suspensa ou cancelada. */
  | "inactive"
  /** Contratou, mas este usuario nao tem papel neste modulo. */
  | "no_role";

export type Identity = {
  userId: string;
  name: string;
  email: string;
  tenantId: string;
  tenantName: string;
  tenantRole: "owner" | "admin" | "member";
  /** Papel no modulo consultado. Nulo quando o usuario nao tem papel nele. */
  moduleRole: string | null;
  license: LicenseState;
};

// O schema concreto varia por modulo; aqui so precisamos das tabelas de shared.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = NodePgDatabase<any>;

/**
 * Carrega a identidade a partir do schema `shared`, ja resolvendo o estado da
 * licenca do modulo pedido.
 *
 * A identidade e unica no ecossistema: os dois modulos leem daqui, e nenhum
 * deles escreve. Retorna null quando o usuario nao existe, esta desativado,
 * nao pertence a nenhum tenant ativo — ou seja, quando nao ha sessao valida.
 */
export async function loadIdentity(
  db: AnyDb,
  params: { userId: string; module: LovetModule },
): Promise<Identity | null> {
  const { userId, module } = params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return null;
  }

  const rows = await db
    .select({
      userId: shared.users.id,
      name: shared.users.name,
      email: shared.users.email,
      tenantId: shared.tenants.id,
      tenantName: shared.tenants.name,
      tenantRole: shared.memberships.tenantRole,
    })
    .from(shared.users)
    .innerJoin(shared.memberships, eq(shared.memberships.userId, shared.users.id))
    .innerJoin(shared.tenants, eq(shared.tenants.id, shared.memberships.tenantId))
    .where(
      and(
        eq(shared.users.id, userId),
        eq(shared.users.status, "active"),
        eq(shared.tenants.status, "active"),
      ),
    )
    .limit(1);

  const base = rows[0];
  if (!base) return null;

  // Papel no modulo e assinatura do modulo sao consultados a parte de proposito:
  // faltar um deles nao invalida a sessao, apenas fecha aquele modulo. Sem isso
  // o usuario seria tratado como nao autenticado e cairia no login sem entender
  // o motivo.
  const [roleRow] = await db
    .select({ role: shared.moduleRoles.role })
    .from(shared.moduleRoles)
    .where(
      and(
        eq(shared.moduleRoles.userId, base.userId),
        eq(shared.moduleRoles.tenantId, base.tenantId),
        eq(shared.moduleRoles.module, module),
      ),
    )
    .limit(1);

  const [subRow] = await db
    .select({ status: shared.subscriptions.status, validUntil: shared.subscriptions.validUntil })
    .from(shared.subscriptions)
    .where(
      and(
        eq(shared.subscriptions.tenantId, base.tenantId),
        eq(shared.subscriptions.module, module),
      ),
    )
    .limit(1);

  return {
    ...base,
    moduleRole: roleRow?.role ?? null,
    license: resolveLicense(subRow, roleRow?.role ?? null),
  };
}

function resolveLicense(
  sub: { status: string; validUntil: Date | null } | undefined,
  moduleRole: string | null,
): LicenseState {
  if (!sub) return "not_subscribed";
  if (sub.status !== "active" && sub.status !== "trial") return "inactive";
  if (sub.validUntil && sub.validUntil.getTime() < Date.now()) return "inactive";
  if (!moduleRole) return "no_role";
  return "licensed";
}

/** Mensagem para a tela de bloqueio, por estado de licenca. */
export function licenseMessage(state: LicenseState): string {
  switch (state) {
    case "not_subscribed":
      return "Sua empresa ainda não contratou este módulo.";
    case "inactive":
      return "A assinatura deste módulo está suspensa. Fale com o responsável pela conta.";
    case "no_role":
      return "Você não tem acesso a este módulo. Peça a um administrador para liberar seu perfil.";
    case "licensed":
      return "";
  }
}

