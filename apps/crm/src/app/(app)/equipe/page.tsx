import { redirect } from "next/navigation";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { shared } from "@lovet/db";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { idsMembrosDaPlataforma } from "@/lib/colaboradores";
import { PageHeader, Badge, card } from "@/components/ui";
import { DarAcessoForm, ResetarSenhaForm } from "@/components/equipe/AcessoForms";
import { ConviteAdminBotao } from "@/components/equipe/ConviteAdmin";
import { EquipesCard } from "@/components/equipe/EquipesCard";
import { listarEquipes } from "@/lib/equipes";
import { revogarConviteAdmin } from "@/app/actions-convites";

const PAPEL_LABEL: Record<string, string> = { rep: "Consultor(a)", sdr: "SDR", manager: "Gestor(a)", admin: "Admin", owner: "Admin", viewer: "Leitura" };

/**
 * Equipe e acessos — gestor vê; só Admin/Proprietária (`manage_access`) altera logins e convida Admins. Lista quem tem login ativo no CRM. Ver app/actions-equipe.ts.
 */
export default async function EquipePage() {
  const user = await requireUser();
  if (!can(user.role, "view_team_dashboard")) redirect("/");
  const podeGerenciar = can(user.role, "manage_access");

  const [membros, naPlataforma] = await Promise.all([
    db.select({ id: s.users.id, nome: s.users.name, email: s.users.email })
      .from(s.workspaceMembers).innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(eq(s.workspaceMembers.workspaceId, user.workspaceId)).orderBy(s.users.name),
    idsMembrosDaPlataforma(user.workspaceId),
  ]);
  // Equipe = quem tem login ativo — ver idsMembrosDaPlataforma.
  const equipe = membros.filter((m) => naPlataforma.has(m.id));
  // Convites de Admin ainda abertos (o link em si não é recuperável: no banco só fica o hash).
  const convitesAbertos = podeGerenciar
    ? await db.select({ id: s.acessoConvites.id, criadoEm: s.acessoConvites.createdAt, expiraEm: s.acessoConvites.expiraEm, criadoPor: s.users.name, para: s.acessoConvites.userId })
        .from(s.acessoConvites).innerJoin(s.users, eq(s.users.id, s.acessoConvites.criadoPor))
        .where(and(eq(s.acessoConvites.workspaceId, user.workspaceId), isNull(s.acessoConvites.usadoEm), isNull(s.acessoConvites.revogadoEm), gt(s.acessoConvites.expiraEm, new Date())))
        .orderBy(desc(s.acessoConvites.createdAt))
    : [];
  const ids = equipe.map((m) => m.id);
  const [logins, papeis] = ids.length ? await Promise.all([
    db.select({ id: shared.users.id, email: shared.users.email, status: shared.users.status }).from(shared.users).where(inArray(shared.users.id, ids)),
    db.select({ userId: shared.moduleRoles.userId, role: shared.moduleRoles.role }).from(shared.moduleRoles)
      .where(and(inArray(shared.moduleRoles.userId, ids), eq(shared.moduleRoles.module, "crm"), eq(shared.moduleRoles.tenantId, user.workspaceId))),
  ]) : [[], []];
  const loginDe = new Map(logins.map((l) => [l.id, l]));
  const papelDe = new Map(papeis.filter((p) => p.role).map((p) => [p.userId, p.role]));
  // Login desativado = sem acesso (não entra); o link nominal/"Dar acesso" reativa com e-mail e senha novos.
  const ativo = (id: string) => loginDe.get(id)?.status === "active";
  const comAcesso = equipe.filter((m) => ativo(m.id) && papelDe.has(m.id)).length;
  const nomeDe = new Map(membros.map((m) => [m.id, m.nome]));

  return (
    <div className="p-4 md:p-8 max-w-[1100px]">
      <PageHeader module="Administrativo" title="Equipe e acessos"
        subtitle={`${equipe.length} pessoas na equipe · ${comAcesso} com acesso ao CRM. O login usa o mesmo cadastro do colaborador — vendas e contratos continuam dele.`} />
      {podeGerenciar ? (
        <div className={`${card} mb-6 p-5`}>
          <h2 className="text-sm font-semibold text-zinc-900">Convites de acesso</h2>
          <p className="mt-1 text-[12.5px] text-zinc-500">
            Cada pessoa recebe um link de cadastro: só informa e-mail e senha e entra com o papel certo. Para quem ainda não está na equipe, use o convite aberto de Admin: ela informa também o nome. Os links valem 7 dias e são de uso único.
          </p>
          <div className="mt-3 flex flex-wrap items-start gap-3">
            <ConviteAdminBotao />
          </div>
          {convitesAbertos.length > 0 && (
            <div className="mt-4 border-t border-zinc-100 pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Convites em aberto</div>
              <ul className="mt-2 space-y-1.5">
                {convitesAbertos.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-zinc-600">
                    <span>{c.para ? <strong className="font-semibold text-zinc-800">{nomeDe.get(c.para) ?? "Colaborador"}</strong> : "Convite aberto"} · gerado em {c.criadoEm.toLocaleDateString("pt-BR")} por {c.criadoPor}</span>
                    <span className="text-zinc-400">expira em {c.expiraEm.toLocaleDateString("pt-BR")}</span>
                    <form action={revogarConviteAdmin} className="ml-auto">
                      <input type="hidden" name="id" value={c.id} />
                      <button className="rounded-md border border-zinc-200 px-2 py-0.5 text-[11.5px] font-semibold text-zinc-600 hover:bg-zinc-50">Revogar</button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800">
          Somente Admin gerencia acessos e convites. Você pode consultar a equipe abaixo.
        </div>
      )}
      <EquipesCard
        equipes={await listarEquipes(user.workspaceId)}
        pessoas={equipe.map((m) => ({ id: m.id, nome: m.nome }))}
        podeEditar={can(user.role, "manage_records")}
      />
      <div className={`${card} divide-y divide-zinc-50`}>
        {equipe.map((m) => {
          const login = loginDe.get(m.id);
          const papel = papelDe.get(m.id) ?? null;
          const temAcesso = ativo(m.id) && !!papel;
          return (
            <div key={m.id} className="px-5 py-3.5 flex flex-wrap items-start gap-x-6 gap-y-2">
              <div className="w-64 shrink-0">
                <div className="font-semibold text-zinc-900 text-[14px]">{m.nome}</div>
                <div className="mt-0.5">
                  {temAcesso ? <Badge tone="green">{PAPEL_LABEL[papel!] ?? papel} · {login!.email}</Badge> : <Badge tone="zinc">Sem acesso</Badge>}
                </div>
              </div>
              <div className="flex-1 min-w-[320px]">
                {m.id === user.id
                  ? <span className="text-[12.5px] text-zinc-400">Você — troque sua senha em “Minha senha”, no menu.</span>
                  : !podeGerenciar
                    ? <span className="text-[12.5px] text-zinc-400">Somente leitura.</span>
                    : papel === "owner" && user.role !== "owner"
                      ? <span className="text-[12.5px] text-zinc-400">Dono da conta — só ele altera este acesso.</span>
                      : !temAcesso
                        ? <ConviteAdminBotao userId={m.id} compacto />
                        : <DarAcessoForm userId={m.id} email={temAcesso ? login!.email : m.email} papel={temAcesso ? papel : null} />}
              </div>
              {podeGerenciar && temAcesso && m.id !== user.id && !(papel === "owner" && user.role !== "owner") && <ResetarSenhaForm userId={m.id} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
