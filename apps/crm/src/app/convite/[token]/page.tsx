import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { BrandLogo } from "@/components/BrandLogo";
import { CadastroConviteForm } from "@/components/equipe/CadastroConviteForm";
import { hashTokenConvite, tokenConviteValido } from "@/lib/convites";

export const dynamic = "force-dynamic";

/**
 * Página pública de cadastro por convite (fica fora do grupo (app): não exige
 * sessão). Só mostra o formulário se o link ainda vale.
 */
export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let valido = false;
  let empresa = "";
  let nomeFixo: string | null = null;
  let papel = "admin";
  if (tokenConviteValido(token)) {
    const [convite] = await db
      .select({ workspace: s.workspaces.name, nome: s.users.name, papel: s.acessoConvites.papel })
      .from(s.acessoConvites)
      .innerJoin(s.workspaces, eq(s.workspaces.id, s.acessoConvites.workspaceId))
      .leftJoin(s.users, eq(s.users.id, s.acessoConvites.userId))
      .where(and(
        eq(s.acessoConvites.tokenHash, hashTokenConvite(token)),
        isNull(s.acessoConvites.usadoEm), isNull(s.acessoConvites.revogadoEm), gt(s.acessoConvites.expiraEm, new Date()),
      ))
      .limit(1);
    valido = !!convite;
    empresa = convite?.workspace ?? "";
    nomeFixo = convite?.nome ?? null;
    papel = convite?.papel ?? "admin";
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-noturno px-6 py-10">
      <div className="w-full max-w-md">
        <BrandLogo className="h-[40px] w-auto text-white" />
        <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/45">CRM</div>

        {valido ? (
          <>
            <h1 className="mt-10 text-2xl font-bold text-white">{nomeFixo ? `Olá, ${nomeFixo.split(" ")[0]}!` : "Crie seu acesso de Admin"}</h1>
            <p className="mt-1 text-sm text-white/60">
              {nomeFixo
                ? <>Você foi convidado(a) como <strong className="text-white/80">{papel === "rep" ? "Consultor(a)" : "Admin"}</strong> do CRM{empresa ? ` — ${empresa}` : ""}. Cadastre seu e-mail e uma senha para entrar.</>
                : <>Você foi convidado(a) para administrar o CRM{empresa ? ` — ${empresa}` : ""}. Preencha para entrar.</>}
            </p>
            {nomeFixo && <p className="mt-3 rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-white/80">{nomeFixo}</p>}
            <CadastroConviteForm token={token} nomeFixo={nomeFixo} />
          </>
        ) : (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.05] p-6">
            <h1 className="text-lg font-bold text-white">Convite indisponível</h1>
            <p className="mt-2 text-sm text-white/65">Este link expirou, já foi usado ou foi cancelado. Peça um novo convite a quem administra o CRM.</p>
            <a href="/login" className="mt-4 inline-block text-sm font-semibold text-emerald-300 hover:text-emerald-200">Ir para o login</a>
          </div>
        )}
      </div>
    </main>
  );
}
