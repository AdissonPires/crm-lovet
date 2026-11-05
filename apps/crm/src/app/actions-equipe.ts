"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { shared } from "@lovet/db";
import { hashPassword, verifyPassword } from "@lovet/auth";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";

/**
 * Acesso ao CRM pra equipe. Os consultores nascem no cadastro do
 * `crm.users`, sem login. Dar acesso cria o login em `shared.users`
 * COM O MESMO ID do colaborador — assim as vendas e contratos dele
 * continuam dele. (Um convite aberto cria um id novo e só libera o
 * financeiro, por isso não serve pra isso.) Senha temporária volta só na
 * resposta da action — aparece uma vez na tela, nunca na URL.
 */

export type EstadoAcao = { ok: boolean; mensagem: string; senha?: string } | null;

// Papéis que a tela oferece: Consultor(a), Gestor(a), Admin e Admin 2 (vê como Admin, sem exportar nem gerenciar acessos). Quem já tem outro papel (proprietária,
// SDR, técnico…) mantém — a validação abaixo aceita o papel atual —, mas ele não é mais oferecido.
const PAPEIS_CRM = ["rep", "manager", "admin", "admin2"] as const;
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";

function senhaTemporaria(tamanho = 10): string {
  const bytes = randomBytes(tamanho);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

async function exigirGestor() {
  const user = await requireUser();
  // Só Admin/Proprietária gerenciam acessos (o Gestor vê a equipe, mas não altera logins).
  if (!can(user.role, "manage_access")) throw new Error("FORBIDDEN");
  return user;
}

export async function darAcessoCrm(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const gestor = await exigirGestor();
  const userId = String(formData.get("userId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const papel = String(formData.get("papel") ?? "rep");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, mensagem: "Informe um e-mail válido." };

  if (userId === gestor.id) return { ok: false, mensagem: "Seu próprio acesso não é alterado por aqui." };

  const [membro] = await db.select({ id: s.users.id, nome: s.users.name }).from(s.users)
    .innerJoin(s.workspaceMembers, eq(s.workspaceMembers.userId, s.users.id))
    .where(and(eq(s.users.id, userId), eq(s.workspaceMembers.workspaceId, gestor.workspaceId)));
  if (!membro) return { ok: false, mensagem: "Colaborador não encontrado." };

  const [emailEmUso] = await db.select({ id: shared.users.id }).from(shared.users)
    .where(and(eq(shared.users.email, email), ne(shared.users.id, userId)));
  if (emailEmUso) return { ok: false, mensagem: `O e-mail ${email} já é o login de outra pessoa.` };

  const [papelAtual] = await db.select({ id: shared.moduleRoles.id, role: shared.moduleRoles.role }).from(shared.moduleRoles)
    .where(and(eq(shared.moduleRoles.userId, userId), eq(shared.moduleRoles.tenantId, gestor.workspaceId), eq(shared.moduleRoles.module, "crm")));
  // O dono da conta (owner) só pode ser alterado por outro owner — senão um Admin conseguiria rebaixá-lo ou tomar o login dele.
  if (papelAtual?.role === "owner" && gestor.role !== "owner") return { ok: false, mensagem: "Este é o dono da conta: só ele altera esse acesso." };
  // Aceita os papéis da tela OU o papel que a pessoa já tem (proprietária, técnico…) — nunca rebaixa sem querer.
  if (!(PAPEIS_CRM as readonly string[]).includes(papel) && papel !== papelAtual?.role) return { ok: false, mensagem: "Papel inválido." };

  const [jaTemLogin] = await db.select({ id: shared.users.id }).from(shared.users).where(eq(shared.users.id, userId));
  let senha: string | undefined;
  if (jaTemLogin) {
    await db.update(shared.users).set({ email, status: "active" }).where(eq(shared.users.id, userId));
  } else {
    senha = senhaTemporaria();
    await db.insert(shared.users).values({ id: userId, name: membro.nome, email, passwordHash: await hashPassword(senha) });
  }
  // E-mail real também no CRM.
  await db.update(s.users).set({ email }).where(eq(s.users.id, userId));

  const [membership] = await db.select({ id: shared.memberships.id }).from(shared.memberships)
    .where(and(eq(shared.memberships.userId, userId), eq(shared.memberships.tenantId, gestor.workspaceId)));
  if (!membership) await db.insert(shared.memberships).values({ tenantId: gestor.workspaceId, userId, tenantRole: "member" });

  if (papelAtual) await db.update(shared.moduleRoles).set({ role: papel }).where(eq(shared.moduleRoles.id, papelAtual.id));
  else await db.insert(shared.moduleRoles).values({ tenantId: gestor.workspaceId, userId, module: "crm", role: papel });
  // Espelho do papel no CRM: listas como "vendedores" (Pré-vendas) e "técnicos" (Operações) leem daqui.
  await db.update(s.workspaceMembers).set({ role: papel as typeof s.workspaceMembers.$inferInsert.role })
    .where(and(eq(s.workspaceMembers.workspaceId, gestor.workspaceId), eq(s.workspaceMembers.userId, userId)));

  revalidatePath("/equipe");
  return senha
    ? { ok: true, mensagem: `${membro.nome} já pode entrar com ${email}. Senha inicial (anote — não aparece de novo):`, senha }
    : { ok: true, mensagem: `Acesso de ${membro.nome} atualizado (${email}). A senha atual continua valendo.` };
}

export async function resetarSenhaCrm(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const gestor = await exigirGestor();
  const userId = String(formData.get("userId") ?? "");
  const [alvo] = await db.select({ id: shared.users.id, nome: shared.users.name }).from(shared.users)
    .innerJoin(shared.memberships, eq(shared.memberships.userId, shared.users.id))
    .where(and(eq(shared.users.id, userId), eq(shared.memberships.tenantId, gestor.workspaceId)));
  if (!alvo) return { ok: false, mensagem: "Essa pessoa ainda não tem acesso." };
  if (userId === gestor.id) return { ok: false, mensagem: "Troque sua própria senha em “Minha senha”, no menu." };
  const [papelAlvo] = await db.select({ role: shared.moduleRoles.role }).from(shared.moduleRoles)
    .where(and(eq(shared.moduleRoles.userId, userId), eq(shared.moduleRoles.tenantId, gestor.workspaceId), eq(shared.moduleRoles.module, "crm")));
  if (papelAlvo?.role === "owner" && gestor.role !== "owner") return { ok: false, mensagem: "Este é o dono da conta: só ele troca a própria senha." };
  const senha = senhaTemporaria();
  await db.update(shared.users).set({ passwordHash: await hashPassword(senha) }).where(eq(shared.users.id, userId));
  await db.delete(shared.sessions).where(eq(shared.sessions.userId, userId)); // derruba sessões abertas com a senha antiga
  return { ok: true, mensagem: `Nova senha de ${alvo.nome} (anote — não aparece de novo):`, senha };
}

export async function trocarMinhaSenha(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const user = await requireUser();
  const atual = String(formData.get("atual") ?? "");
  const nova = String(formData.get("nova") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");
  if (nova.length < 8) return { ok: false, mensagem: "A nova senha precisa ter pelo menos 8 caracteres." };
  if (nova !== confirmacao) return { ok: false, mensagem: "A confirmação não bate com a nova senha." };
  const [conta] = await db.select({ hash: shared.users.passwordHash }).from(shared.users).where(eq(shared.users.id, user.id));
  if (!conta || !(await verifyPassword(atual, conta.hash))) return { ok: false, mensagem: "Senha atual incorreta." };
  await db.update(shared.users).set({ passwordHash: await hashPassword(nova) }).where(eq(shared.users.id, user.id));
  return { ok: true, mensagem: "Senha alterada." };
}
