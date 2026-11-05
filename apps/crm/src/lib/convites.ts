import { createHash, randomBytes } from "node:crypto";

/** Quanto tempo o link vale (uso único; depois disso o Admin gera outro). */
export const CONVITE_VALIDADE_DIAS = 7;

/** Token do link: 32 bytes aleatórios em base64url. Nunca é gravado — só o hash. */
export function gerarTokenConvite(): string {
  return randomBytes(32).toString("base64url");
}

export function hashTokenConvite(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Formato do token — evita ir ao banco com lixo vindo da URL. */
export function tokenConviteValido(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
