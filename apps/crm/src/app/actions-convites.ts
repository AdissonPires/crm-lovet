"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { shared } from "@lovet/db";
import { hashPassword, createSession, SESSION_COOKIE } from "@lovet/auth";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { CONVITE_VALIDADE_DIAS, gerarTokenConvite, hashTokenConvite, tokenConviteValido } from "@/lib/convites";

/**
 * Cadastro por convite (Admin). Quem já é Admin/Proprietária gera um link de
 * uso único (`criarConviteAdmin`); a pessoa abre `/convite/<token>`, informa
 * e-mail e senha (`aceitarConvite`) e entra já como Admin. Só o hash do token
 * fica no banco, e o link aparece uma única vez na tela de quem gerou.
 *
 * Dois tipos:
 *  - NOMINAL (`userId`): para quem já existe no CRM. O login é criado com o
 *    MESMO id — vendas e contratos continuam da pessoa. O nome vem do
 *    cadastro; ela só informa e-mail e senha. O PAPEL é decidido aqui, nunca
 *    pelo navegador: Consultor(a).
 *  - ABERTO (sem `userId`): para quem ainda não existe no CRM. Cria uma
 *    pessoa nova com o nome informado, como Admin.
 */

export type EstadoConvite = { ok: boolean; mensagem: string; token?: string } | null;

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // mesma janela da sessão do login

async function exigirAdmin() {
  const user = await requireUser();
  if (!can(user.role, "manage_access")) throw new Error("FORBIDDEN");
  return user;
}

async function gravarConvite(workspaceId: string, criadoPor: string, papel: "admin" | "rep", userId: string | null): Promise<string> {
  if (userId) {
    // Um link válido por pessoa: o novo cancela o anterior que ainda não foi usado.
    await db.update(s.acessoConvites).set({ revogadoEm: new Date() })
      .where(and(eq(s.acessoConvites.userId, userId), isNull(s.acessoConvites.usadoEm), isNull(s.acessoConvites.revogadoEm)));
  }
  const token = gerarTokenConvite();
  const expiraEm = new Date(Date.now() + CONVITE_VALIDADE_DIAS * 24 * 60 * 60 * 1000);
  await db.insert(s.acessoConvites).values({
    workspaceId, tokenHash: hashTokenConvite(token), papel, criadoPor, expiraEm, userId,
  });
  return token;
}

export async function criarConviteAdmin(userId?: string): Promise<EstadoConvite> {
  const admin = await exigirAdmin();
  let papel: "admin" | "rep" = "admin";

  if (userId) {
    const [membro] = await db.select({ id: s.users.id, nome: s.users.name }).from(s.users)
      .innerJoin(s.workspaceMembers, eq(s.workspaceMembers.userId, s.users.id))
      .where(and(eq(s.users.id, userId), eq(s.workspaceMembers.workspaceId, admin.workspaceId)));
    if (!membro) return { ok: false, mensagem: "Colaborador não encontrado." };
    papel = "rep";
    const [jaTemLogin] = await db.select({ status: shared.users.status }).from(shared.users).where(eq(shared.users.id, userId));
    // Login desativado pode receber link: o cadastro reativa com o e-mail e a senha novos.
    if (jaTemLogin?.status === "active") return { ok: false, mensagem: "Essa pessoa já tem acesso. Use “Nova senha” se ela esqueceu a senha." };
  }

  const token = await gravarConvite(admin.workspaceId, admin.id, papel, userId ?? null);
  revalidatePath("/equipe");
  return { ok: true, mensagem: `Link de uso único (${papel === "rep" ? "Consultor(a)" : "Admin"}), válido por ${CONVITE_VALIDADE_DIAS} dias. Copie agora — ele não aparece de novo.`, token };
}

export async function revogarConviteAdmin(formData: FormData): Promise<void> {
  const admin = await exigirAdmin();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await db.update(s.acessoConvites).set({ revogadoEm: new Date() })
    .where(and(eq(s.acessoConvites.id, id), eq(s.acessoConvites.workspaceId, admin.workspaceId), isNull(s.acessoConvites.usadoEm)));
  revalidatePath("/equipe");
}

/** Público (sem sessão): quem tem o link se cadastra. A segurança é o token. */
export async function aceitarConvite(_: EstadoConvite, formData: FormData): Promise<EstadoConvite> {
  const token = String(formData.get("token") ?? "");
  const nomeInformado = String(formData.get("nome") ?? "").trim().replace(/\s+/g, " ");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("password") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (!tokenConviteValido(token)) return { ok: false, mensagem: "Link de convite inválido." };
  const valido = and(
    eq(s.acessoConvites.tokenHash, hashTokenConvite(token)),
    isNull(s.acessoConvites.usadoEm), isNull(s.acessoConvites.revogadoEm), gt(s.acessoConvites.expiraEm, new Date()),
  );
  const [previa] = await db.select({ userId: s.acessoConvites.userId }).from(s.acessoConvites).where(valido).limit(1);
  if (!previa) return { ok: false, mensagem: "Este convite expirou, já foi usado ou foi cancelado. Peça um novo ao Admin." };
  const nominal = previa.userId;

  if (!nominal && nomeInformado.length < 3) return { ok: false, mensagem: "Informe seu nome completo." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, mensagem: "Informe um e-mail válido." };
  if (senha.length < 8) return { ok: false, mensagem: "A senha precisa ter pelo menos 8 caracteres." };
  if (senha !== confirmacao) return { ok: false, mensagem: "A confirmação não bate com a senha." };

  const [emailNoLogin] = await db.select({ id: shared.users.id }).from(shared.users)
    .where(nominal ? and(eq(shared.users.email, email), ne(shared.users.id, nominal)) : eq(shared.users.email, email)).limit(1);
  const [emailNoCrm] = await db.select({ id: s.users.id }).from(s.users)
    .where(nominal ? and(eq(s.users.email, email), ne(s.users.id, nominal)) : eq(s.users.email, email)).limit(1);
  if (emailNoLogin || emailNoCrm) return { ok: false, mensagem: "Esse e-mail já é usado por outra conta. Use outro e-mail ou fale com o Admin." };
  let loginDesativado = false;
  if (nominal) {
    const [jaTemLogin] = await db.select({ status: shared.users.status }).from(shared.users).where(eq(shared.users.id, nominal));
    if (jaTemLogin?.status === "active") return { ok: false, mensagem: "Você já tem acesso. Entre pela tela de login ou peça uma nova senha ao Admin." };
    loginDesativado = !!jaTemLogin;
  }

  const senhaHash = await hashPassword(senha);
  const userId = nominal ?? randomUUID();

  const resultado = await db.transaction(async (tx) => {
    // Consome o convite de forma atômica: dois cadastros com o mesmo link — só um passa.
    const [convite] = await tx.update(s.acessoConvites)
      .set({ usadoEm: new Date() })
      .where(valido)
      .returning({ id: s.acessoConvites.id, workspaceId: s.acessoConvites.workspaceId, papel: s.acessoConvites.papel });
    if (!convite) return null;
    const papel = convite.papel as "admin" | "rep";

    let nome = nomeInformado;
    if (nominal) {
      // Mesmo cadastro: só ganha e-mail real, papel e login.
      const [cadastro] = await tx.update(s.users).set({ email }).where(eq(s.users.id, nominal)).returning({ name: s.users.name });
      nome = cadastro.name;
      await tx.update(s.workspaceMembers).set({ role: papel, status: "active" })
        .where(and(eq(s.workspaceMembers.workspaceId, convite.workspaceId), eq(s.workspaceMembers.userId, nominal)));
    } else {
      await tx.insert(s.users).values({ id: userId, email, name: nome });
      await tx.insert(s.workspaceMembers).values({ workspaceId: convite.workspaceId, userId, role: papel, status: "active" });
    }
    if (loginDesativado) {
      // Já teve login (desativado): reativa com o e-mail e a senha informados agora.
      await tx.update(shared.users).set({ email, name: nome, passwordHash: senhaHash, status: "active" }).where(eq(shared.users.id, userId));
      await tx.delete(shared.sessions).where(eq(shared.sessions.userId, userId));
    } else {
      await tx.insert(shared.users).values({ id: userId, email, name: nome, passwordHash: senhaHash });
    }
    // Papel é por MÓDULO (shared.module_roles); no nível da empresa todo convidado é "member", igual à tela Equipe.
    await tx.insert(shared.memberships).values({ tenantId: convite.workspaceId, userId, tenantRole: "member" }).onConflictDoNothing();
    await tx.insert(shared.moduleRoles).values({ tenantId: convite.workspaceId, userId, module: "crm", role: papel })
      .onConflictDoUpdate({ target: [shared.moduleRoles.tenantId, shared.moduleRoles.userId, shared.moduleRoles.module], set: { role: papel } });
    await tx.update(s.acessoConvites).set({ usadoPor: userId }).where(eq(s.acessoConvites.id, convite.id));
    return convite;
  });

  if (!resultado) return { ok: false, mensagem: "Este convite expirou, já foi usado ou foi cancelado. Peça um novo ao Admin." };

  // Entra direto, como no login.
  const sessao = await createSession(db, userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, sessao, {
    httpOnly: true, path: "/", sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/");
}
