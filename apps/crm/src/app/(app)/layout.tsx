import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  LayoutDashboard, Target, Users, CheckSquare, LogOut, MessageCircle, Mic,
  Percent, FileSignature,
  Filter, Megaphone, PieChart,
  MessageSquareHeart, FileBarChart, UserCog, KeyRound, Menu, BarChart3, ShoppingCart, FileText, Package,
} from "lucide-react";
import { licenseMessage } from "@lovet/auth";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { logout } from "@/app/actions";
import { db, schema as s } from "@/db";
import { SidebarNavLink } from "@/components/dashboard/SidebarNavLink";
import { BrandLogo } from "@/components/BrandLogo";
import { FecharMenuMobile } from "@/components/dashboard/FecharMenuMobile";
import { BarraNavegacao } from "@/components/BarraNavegacao";
import { Suspense } from "react";

/** Sessao valida, modulo fechado. Explica o motivo e oferece a saida. */
function ModuleBlocked({ user }: { user: SessionUser }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-noturno px-6">
      <div className="w-full max-w-md rounded-3xl bg-white/[0.04] border border-white/10 p-8 text-center">
        <BrandLogo className="h-[34px] w-auto text-white mx-auto mb-6" />
        <h1 className="text-lg font-semibold text-white">CRM indisponível</h1>
        <p className="mt-2 text-sm text-zinc-400">{licenseMessage(user.license)}</p>
        <p className="mt-4 text-xs text-zinc-500">
          {user.name} · {user.workspaceName}
        </p>
        <form action={logout} className="mt-6">
          <button className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white hover:bg-white/[0.08] transition-colors">
            Sair
          </button>
        </form>
      </div>
    </main>
  );
}

type NavItem = { href: string; label: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; needs: string };
type NavGroup = { module: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    module: "Vendas",
    items: [
      { href: "/pre-vendas", label: "Pré-vendas (SDR)", Icon: Filter, needs: "view_presales" },
      { href: "/indicadores", label: "Indicadores", Icon: BarChart3, needs: "view_team_dashboard" },
      { href: "/pipeline", label: "Pipeline de Vendas", Icon: Target, needs: "view_pipeline" },
      { href: "/cotacoes", label: "Cotações", Icon: FileText, needs: "view_pipeline" },
      { href: "/pedidos", label: "Pedidos", Icon: ShoppingCart, needs: "view_pipeline" },
      { href: "/produtos", label: "Produtos", Icon: Package, needs: "view_pipeline" },
      { href: "/feedmeet", label: "FeedMeet", Icon: Mic, needs: "view_pipeline" },
      { href: "/whatsapp", label: "WhatsApp", Icon: MessageCircle, needs: "use_whatsapp" },
      { href: "/campanhas", label: "Campanhas WhatsApp", Icon: Megaphone, needs: "use_whatsapp" },
      { href: "/empresas", label: "Clientes", Icon: Users, needs: "view_pipeline" },
      { href: "/segmentacao", label: "Clientes por Segmento", Icon: PieChart, needs: "view_pipeline" },
      { href: "/contatos", label: "Contatos", Icon: Users, needs: "view_pipeline" },
      { href: "/contratos", label: "Contratos", Icon: FileSignature, needs: "view_pipeline" },
      { href: "/comissoes", label: "Comissões", Icon: Percent, needs: "view_pipeline" },
      { href: "/tarefas", label: "Tarefas", Icon: CheckSquare, needs: "view_pipeline" },
    ],
  },
  {
    // Estoque, Folha e Operações saíram do menu a pedido do negócio — ficou só
    // o que é usado no dia a dia da operação. As páginas continuam existindo (o
    // card "Agenda de Hoje" do dashboard, por ex., ainda linka /operacoes),
    // só não aparecem mais aqui.
    module: "Administrativo",
    items: [
      { href: "/equipe", label: "Equipe e acessos", Icon: UserCog, needs: "view_team_dashboard" },
    ],
  },
];

const roleLabel: Record<string, string> = {
  owner: "Admin", admin: "Admin", manager: "Gestor(a)",
  rep: "Consultor(a)", sdr: "Pré-vendas (SDR)", viewer: "Leitura",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Sessao valida mas modulo indisponivel (nao contratado, suspenso, ou usuario
  // sem papel aqui): explica o motivo em vez de devolver ao login.
  if (user.license !== "licensed") {
    return <ModuleBlocked user={user} />;
  }

  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((n) => can(user.role, n.needs)) }))
    .filter((g) => g.items.length > 0);

  const [unread] = can(user.role, "use_whatsapp")
    ? await db.select({ total: sql<number>`coalesce(sum(${s.whatsappConversations.unreadCount}), 0)` })
        .from(s.whatsappConversations)
        .where(eq(s.whatsappConversations.workspaceId, user.workspaceId))
    : [{ total: 0 }];

  const [unreadFeedback] = await db.select({ total: sql<number>`count(*)` })
    .from(s.feedbackMessages)
    .where(and(
      eq(s.feedbackMessages.workspaceId, user.workspaceId),
      eq(s.feedbackMessages.toUserId, user.id),
      isNull(s.feedbackMessages.readAt),
    ));

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Celular: o menu vira gaveta. Checkbox oculto abre/fecha (CSS puro, via
          peer-checked); FecharMenuMobile fecha ao trocar de página. No desktop
          (md+) nada muda: o menu fica fixo ao lado como antes. */}
      <input id="menu-mobile" type="checkbox" className="peer sr-only" aria-label="Abrir menu" />
      <header className="md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-brand-900 text-white flex items-center gap-3 px-4 shadow">
        <label htmlFor="menu-mobile" className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/10 cursor-pointer" title="Menu">
          <Menu className="h-5 w-5" />
        </label>
        <BrandLogo className="h-[20px] w-auto text-white" />
      </header>
      <label htmlFor="menu-mobile" aria-hidden className="md:hidden fixed inset-0 z-40 bg-black/40 hidden peer-checked:block" />
      <aside className="w-64 shrink-0 bg-brand-900 flex flex-col text-white max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-72 max-md:-translate-x-full peer-checked:translate-x-0 transition-transform duration-200">
        {/* A logo é o próprio nome da marca (wordmark), então dispensa ícone
            ao lado — repetir símbolo + nome competiria pela mesma leitura.
            O SVG usa currentColor, por isso herda o branco daqui. */}
        <div className="px-5 py-6">
          <BrandLogo className="h-[26px] w-auto text-white" />
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.18em] text-white/45">CRM</div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-4 overflow-y-auto">
          <div className="space-y-0.5">
            <SidebarNavLink href="/" label="Dashboard" icon={<LayoutDashboard strokeWidth={2} />} />
            <SidebarNavLink
              href="/feedback" label="Feedback" icon={<MessageSquareHeart strokeWidth={2} />}
              badge={Number(unreadFeedback.total) > 0 && (
                <span className="h-5 min-w-[20px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadFeedback.total}
                </span>
              )}
            />
            <SidebarNavLink href="/relatorios" label="Meu relatório" icon={<FileBarChart strokeWidth={2} />} />
          </div>
          {groups.map((g) => (
            <div key={g.module}>
              <div className="px-3.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/35">{g.module}</div>
              <div className="space-y-0.5">
                {g.items.map(({ href, label, Icon }) => (
                  <SidebarNavLink
                    key={href} href={href} label={label} icon={<Icon strokeWidth={2} />}
                    badge={href === "/whatsapp" && Number(unread.total) > 0 && (
                      <span className="h-5 min-w-[20px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {unread.total}
                      </span>
                    )}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 pb-3">
          <div className="rounded-xl bg-white/5 px-3.5 py-2.5 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-white text-brand-800 flex items-center justify-center text-xs font-bold shrink-0">
              {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold text-white truncate">{user.name}</div>
              <div className="text-[10.5px] text-white/50">{roleLabel[user.role] ?? user.role}</div>
              <a href="/conta/senha" className="inline-flex items-center gap-1 text-[10.5px] text-white/50 hover:text-white">
                <KeyRound className="h-3 w-3" /> Minha senha
              </a>
            </div>
            <form action={logout}>
              <button title="Sair" className="text-white/50 hover:text-white transition-colors">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto max-md:pt-14">{children}</main>
      <Suspense><FecharMenuMobile /></Suspense>
      <Suspense><BarraNavegacao /></Suspense>
    </div>
  );
}
