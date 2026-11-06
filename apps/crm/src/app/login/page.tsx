import { AlertCircle, Bell, LifeBuoy, RefreshCw, Sparkles, type LucideIcon } from "lucide-react";
import { login } from "@/app/actions";
import { BrandLogo } from "@/components/BrandLogo";
import { PasswordField } from "@/components/PasswordField";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  const campo =
    "w-full rounded-xl bg-white/[0.06] border border-white/15 px-3.5 py-3 text-sm text-white placeholder:text-white/35 focus:border-brand-400 focus:bg-white/[0.09] focus:outline-none focus:ring-2 focus:ring-brand/30 transition-colors";

  return (
    <main className="min-h-screen flex flex-col lg:flex-row bg-noturno">
      {/* ── Autenticação ─────────────────────────────────────────────── */}
      <section className="relative flex w-full flex-1 flex-col justify-between px-6 py-8 sm:px-12 lg:w-[42%] lg:flex-none lg:px-14 xl:px-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_0%_0%,rgba(0,153,73,0.22),transparent_70%)]" />

        <div className="relative flex flex-col items-start">
          <BrandLogo alturaPx={96} />
          <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/45">CRM</div>
        </div>

        <div className="relative mx-auto my-10 w-full max-w-sm lg:mx-0">
          <h1 className="text-2xl font-semibold text-white">Acesse sua conta</h1>
          <p className="mt-1.5 text-sm text-white/55">Entre com seu e-mail corporativo para continuar.</p>

          <form action={login} className="mt-8 space-y-5">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-white/70">E-mail</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
                placeholder="seu@email.com"
                className={campo}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-white/70">Senha</span>
              <PasswordField className={campo} />
            </label>

            {erro && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/[0.1] px-3.5 py-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" strokeWidth={2} />
                <p className="text-[13px] text-red-300">{erro}</p>
              </div>
            )}

            <button className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
              Entrar
            </button>
          </form>

        </div>

        <p className="relative text-[11px] text-white/35">Lovet Distribuidora · CRM · Acesso restrito a usuários autorizados.</p>
      </section>

      {/* ── Painel informativo ───────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden border-l border-white/10 bg-gradient-to-br from-noturno via-brand-900 to-[#0f3d2a] lg:flex lg:w-[58%] lg:flex-col lg:justify-center lg:px-12 xl:px-16">
        {/* Textura sutil: grade de pontos + brilhos verdes (sem imagem, pra não competir com a marca). */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(110,231,160,0.30)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(70%_70%_at_80%_20%,black,transparent)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(45%_40%_at_90%_0%,rgba(0,153,73,0.30),transparent_70%),radial-gradient(40%_40%_at_10%_100%,rgba(74,222,128,0.10),transparent_70%)]"
        />

        <div className="relative mx-auto w-full max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            Lovet Distribuidora
          </span>

          <h2 className="mt-5 text-3xl font-light leading-tight text-white xl:text-4xl">
            Tudo o que você precisa para
            <br />
            <span className="font-semibold">gerenciar melhor seus clientes</span>
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/60">
            Funil comercial, indicadores de vendas, atendimento por WhatsApp e relacionamento com clientes em um só lugar.
          </p>

          <div className="mt-9 grid gap-4 sm:grid-cols-2">
            {CARDS.map(({ Icon, titulo, descricao }) => (
              <article
                key={titulo}
                className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 transition-colors hover:border-emerald-300/30 hover:bg-white/[0.08]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/25 text-emerald-200">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold text-white">{titulo}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-white/60">{descricao}</p>
              </article>
            ))}
          </div>

        </div>
      </aside>
    </main>
  );
}

/**
 * Conteúdo institucional estático. Ainda não existe um sistema de avisos no
 * projeto: quando existir, é aqui que a lista passa a vir dele. Nada abaixo
 * representa dado operacional (sem métricas, sem status de serviço).
 */
const CARDS: { Icon: LucideIcon; titulo: string; descricao: string }[] = [
  {
    Icon: Bell,
    titulo: "Avisos importantes",
    descricao: "Comunicados sobre manutenção e mudanças operacionais serão divulgados pela equipe responsável.",
  },
  {
    Icon: Sparkles,
    titulo: "Novidades do CRM",
    descricao: "Novos recursos e melhorias da plataforma são apresentados aos usuários após cada atualização.",
  },
  {
    Icon: RefreshCw,
    titulo: "Atualizações do sistema",
    descricao: "Dados de vendas e atendimento atualizados para manter o time sempre em dia.",
  },
  {
    Icon: LifeBuoy,
    titulo: "Suporte e atendimento",
    descricao: "Em caso de dúvida ou dificuldade de acesso, fale com o administrador da sua empresa.",
  },
];
