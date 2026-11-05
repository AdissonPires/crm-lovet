import { redirect } from "next/navigation";
import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import {
  Users, UserPlus, Target, ShoppingBag, Megaphone, FileBarChart,
  StickyNote, Phone, Sparkles,
} from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { brl, relTime, greeting, dateLongBR, weekdayBR, monthShortBR } from "@/lib/format";
import { Header } from "@/components/dashboard/Header";
import type { NotificationItem } from "@/components/dashboard/NotificationsBell";
import { pendingHandoffsFor } from "@/lib/handoff";
import { KpiCards, type Kpi } from "@/components/dashboard/KpiCards";
import { FunnelCard } from "@/components/dashboard/FunnelCard";
import { SalesChartCard } from "@/components/dashboard/SalesChartCard";
import { AgendaCard, type AgendaItem } from "@/components/dashboard/AgendaCard";
import { agendaDoDia } from "@/lib/agenda";
import { ActivitiesCard, type ActivityRow } from "@/components/dashboard/ActivitiesCard";
import { QuickActionsCard, type QuickAction } from "@/components/dashboard/QuickActionsCard";
import { FooterBar } from "@/components/dashboard/FooterBar";

function pctLabel(curr: number, prev: number): { label: string; positive: boolean } | null {
  if (prev <= 0) return null;
  const pct = ((curr - prev) / prev) * 100;
  const positive = pct >= 0;
  return { label: `${positive ? "+" : ""}${pct.toFixed(1).replace(".", ",")}%`, positive };
}

const actMeta: Record<string, { Icon: ActivityRow["Icon"]; colorClass: string }> = {
  note: { Icon: StickyNote, colorClass: "bg-zinc-400" },
  call_logged: { Icon: Phone, colorClass: "bg-sky-500" },
  stage_changed: { Icon: Target, colorClass: "bg-brand-600" },
  ai_suggestion: { Icon: Sparkles, colorClass: "bg-violet-500" },
};

export default async function DashboardPage() {
  const user = await requireUser();
  if (!can(user.role, "view_pipeline")) {
    redirect(can(user.role, "view_presales") ? "/pre-vendas" : "/conta/senha");
  }
  const wsId = user.workspaceId;
    // rep/viewer não têm view_team_dashboard: a agenda mostra só as tarefas deles.
  const podeVerEquipe = can(user.role, "view_team_dashboard");

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  // Fim (exclusivo) do recorte "mesmo período do mês anterior": do dia 1 até o
  // dia de hoje, inclusive. Limitado ao início do mês corrente pra hoje = 31
  // não invadir o mês atual quando o anterior tem menos dias.
  const endOfSamePeriodLastMonth = new Date(
    Math.min(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate() + 1).getTime(), startOfThisMonth.getTime()),
  );
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // ── Oportunidades / funil ─────────────────────────────────────────────────
  // Agregado no banco: trazer todas as colunas pra contar em memória seria a consulta mais lenta da página.
  const o = s.opportunities;
  const fechadaEm = sql`coalesce(case when ${o.status} = 'won' then ${o.closedAt} else ${o.updatedAt} end, ${o.updatedAt})`;
  const [[resumoOpps], abertasPorEtapa] = await Promise.all([
    db.select({
      abertas: sql<number>`count(*) filter (where ${o.status} = 'open')::int`,
      potencialAberto: sql<number>`coalesce(sum(${o.amount}) filter (where ${o.status} = 'open'), 0)::float`,
      ganhasNoMes: sql<number>`count(*) filter (where ${o.status} = 'won' and ${o.closedAt} >= ${startOfThisMonth})::int`,
      valorGanhoNoMes: sql<number>`coalesce(sum(${o.amount}) filter (where ${o.status} = 'won' and ${o.closedAt} >= ${startOfThisMonth}), 0)::float`,
      fechadasNoMes: sql<number>`count(*) filter (where ${o.status} <> 'open' and ${fechadaEm} >= ${startOfThisMonth})::int`,
    }).from(o).where(eq(o.workspaceId, wsId)),
    db.select({ stageId: o.stageId, total: sql<number>`count(*)::int` })
      .from(o).where(and(eq(o.workspaceId, wsId), eq(o.status, "open"))).groupBy(o.stageId),
  ]);
  const pipelineTotal = resumoOpps.potencialAberto;
  const ganhasNoMes = resumoOpps.ganhasNoMes;

  // Só as etapas do funil PADRÃO. Sem o filtro de is_default, a chegada dos
  // múltiplos funis fazia o card somar as etapas de todos eles: o funil
  // aparecia com nomes repetidos ("Proposta enviada" duas vezes) e uma fileira
  // de zeros, porque cada funil tem seu próprio conjunto de etapas.
  const salesStages = await db.select({ id: s.pipelineStages.id, name: s.pipelineStages.name, order: s.pipelineStages.order })
    .from(s.pipelineStages)
    .innerJoin(s.pipelines, eq(s.pipelines.id, s.pipelineStages.pipelineId))
    .where(and(
      eq(s.pipelines.workspaceId, wsId),
      eq(s.pipelines.kind, "sales"),
      eq(s.pipelines.isDefault, true),
    ))
    .orderBy(asc(s.pipelineStages.order));

  const openCountByStage = new Map(abertasPorEtapa.map((r) => [r.stageId, r.total]));
  const funnelStages = salesStages.map((st) => ({ label: st.name, value: openCountByStage.get(st.id) ?? 0 }));

  // ── KPIs ───────────────────────────────────────────────────────────────────
  // "Clientes": cadastrados no ano corrente (até hoje) vs. o mesmo período do ano anterior.
  const anoAtual = now.getFullYear();
  const amanha = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const co = s.companies;
  const contarClientes = async (de: Date, ate: Date) => {
    const [r] = await db.select({ total: sql<number>`count(*)::int` }).from(co)
      .where(and(eq(co.workspaceId, wsId), isNull(co.deletedAt), gte(co.createdAt, de), lt(co.createdAt, ate)));
    return r.total;
  };
  const [companiesNow, companiesBefore] = await Promise.all([
    contarClientes(new Date(anoAtual, 0, 1), amanha),
    contarClientes(new Date(anoAtual - 1, 0, 1), new Date(anoAtual - 1, now.getMonth(), now.getDate() + 1)),
  ]);

  // "Novos clientes cadastrados": neste mês vs. o mesmo período do mês anterior.
  const [novosClientesMes, novosClientesMesAnterior] = await Promise.all([
    contarClientes(startOfThisMonth, amanha),
    contarClientes(startOfLastMonth, endOfSamePeriodLastMonth),
  ]);

  // "Vendas (Mês)": contratos assinados no mês vs. o mesmo período do mês anterior.
  const [{ total: salesThisMonth }] = await db.select({ total: sql<number>`coalesce(sum(${s.contracts.value}), 0)::float` })
    .from(s.contracts).where(and(eq(s.contracts.workspaceId, wsId), eq(s.contracts.status, "signed"), gte(s.contracts.signedAt, startOfThisMonth), lt(s.contracts.signedAt, startOfNextMonth)));
  const [{ total: salesLastMonth }] = await db.select({ total: sql<number>`coalesce(sum(${s.contracts.value}), 0)::float` })
    .from(s.contracts).where(and(eq(s.contracts.workspaceId, wsId), eq(s.contracts.status, "signed"), gte(s.contracts.signedAt, startOfLastMonth), lt(s.contracts.signedAt, endOfSamePeriodLastMonth)));

  const clientesDelta = pctLabel(companiesNow, companiesBefore);
  const novosClientesDelta = pctLabel(novosClientesMes, novosClientesMesAnterior);
  const vendasDelta = pctLabel(salesThisMonth, salesLastMonth);

  const kpis: Kpi[] = [
    {
      label: `Clientes cadastrados em ${anoAtual}`, value: companiesNow.toLocaleString("pt-BR"), Icon: Users, tint: "bg-sky-50 text-sky-600",
      delta: clientesDelta ? `${clientesDelta.label} vs mesmo período de ${anoAtual - 1}` : undefined, positive: clientesDelta?.positive,
    },
    {
      label: "Novos clientes cadastrados", value: novosClientesMes.toLocaleString("pt-BR"), Icon: UserPlus, tint: "bg-emerald-50 text-emerald-600",
      delta: novosClientesDelta ? `${novosClientesDelta.label} vs mesmo período do mês anterior` : undefined, positive: novosClientesDelta?.positive,
    },
    {
      label: "Oportunidades", value: resumoOpps.abertas.toLocaleString("pt-BR"), sub: `${brl(pipelineTotal)} em potencial`,
      Icon: Target, tint: "bg-amber-50 text-amber-600",
    },
    {
      label: "Vendas (Mês)", value: brl(salesThisMonth), Icon: ShoppingBag, tint: "bg-brand-50 text-brand-700",
      delta: vendasDelta ? `${vendasDelta.label} vs mesmo período do mês anterior` : undefined, positive: vendasDelta?.positive,
    },
  ];

  // ── Vendas últimos 6 meses ────────────────────────────────────────────────
  const monthlyRaw = await db.select({
    monthKey: sql<string>`to_char(${s.contracts.signedAt}, 'YYYY-MM')`,
    total: sql<number>`coalesce(sum(${s.contracts.value}), 0)::float`,
  }).from(s.contracts)
    .where(and(eq(s.contracts.workspaceId, wsId), eq(s.contracts.status, "signed"), gte(s.contracts.signedAt, sixMonthsAgo)))
    .groupBy(sql`to_char(${s.contracts.signedAt}, 'YYYY-MM')`);
  const monthlyMap = new Map(monthlyRaw.map((r) => [r.monthKey, r.total]));
  const salesSeries = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { month: monthShortBR(d), value: monthlyMap.get(key) ?? 0 };
  });

  // ── Agenda de hoje — tarefas do CRM com vencimento hoje (gestão vê a equipe; os demais, as próprias) ──
  const agenda: AgendaItem[] = (await agendaDoDia(wsId, now, podeVerEquipe ? undefined : user.id)).map((c) => ({
    id: c.id, time: c.hora, client: c.cliente, kind: c.atividade, status: c.status, responsavel: c.responsavel ?? undefined,
  }));

  // ── Atividades recentes ──────────────────────────────────────────────────
  const recentActs = await db.select({ act: s.activities, actorName: s.users.name })
    .from(s.activities)
    .leftJoin(s.users, eq(s.users.id, s.activities.actorId))
    .where(eq(s.activities.workspaceId, wsId))
    .orderBy(desc(s.activities.createdAt)).limit(6);
  const activities: ActivityRow[] = recentActs.map((r) => {
    const meta = actMeta[r.act.type] ?? { Icon: StickyNote, colorClass: "bg-zinc-400" };
    const payload = r.act.payload as { text?: string; to?: string };
    const who = r.act.actorType === "ai_agent" ? "Agente IA" : r.act.actorType === "system" ? "Sistema" : r.actorName ?? "—";
    const what = payload.text ?? (payload.to ? `Movido para ${payload.to}` : "Atividade registrada");
    return { id: r.act.id, Icon: meta.Icon, colorClass: meta.colorClass, text: `${who} · ${what}`, time: relTime(r.act.createdAt) };
  });

  // ── Notificações (sino) ───────────────────────────────────────────────────
  const unreadConvos = can(user.role, "use_whatsapp")
    ? await db.select().from(s.whatsappConversations)
        .where(and(eq(s.whatsappConversations.workspaceId, wsId), gte(s.whatsappConversations.unreadCount, 1)))
        .orderBy(desc(s.whatsappConversations.lastMessageAt)).limit(8)
    : [];
  const unreadFeedbackRows = await db.select({ fb: s.feedbackMessages, fromName: s.users.name })
    .from(s.feedbackMessages)
    .innerJoin(s.users, eq(s.users.id, s.feedbackMessages.fromUserId))
    .where(and(eq(s.feedbackMessages.workspaceId, wsId), eq(s.feedbackMessages.toUserId, user.id), isNull(s.feedbackMessages.readAt)))
    .orderBy(desc(s.feedbackMessages.createdAt)).limit(8);

  // Pedidos de atendente humano entram PRIMEIRO na lista: é o único tipo que
  // exige ação imediata — do outro lado tem alguém esperando resposta agora.
  const handoffs = await pendingHandoffsFor(wsId, user.id);

  const notifications: NotificationItem[] = [
    ...handoffs.map((h) => ({
      id: `ho-${h.id}`, kind: "handoff" as const, at: new Date(h.createdAt), urgent: true,
      title: `${h.contactName} pediu atendente${h.sectorName ? ` · ${h.sectorName}` : ""}`,
      preview: h.summary ?? "Aguardando alguém assumir",
      time: relTime(h.createdAt), href: "/atendimentos",
    })),
    ...unreadConvos.map((c) => ({
      id: `wa-${c.id}`, kind: "whatsapp" as const, at: new Date(c.lastMessageAt),
      title: c.contactName, preview: c.lastMessagePreview ?? "Nova mensagem",
      time: relTime(c.lastMessageAt), href: `/whatsapp?c=${c.id}`,
    })),
    ...unreadFeedbackRows.map((r) => ({
      id: `fb-${r.fb.id}`, kind: "feedback" as const, at: new Date(r.fb.createdAt),
      title: `Feedback de ${r.fromName}`, preview: r.fb.message,
      time: relTime(r.fb.createdAt), href: "/feedback",
    })),
  ]
    // Urgente primeiro, depois por data — um pedido de atendimento de 10 min
    // atrás vale mais que uma mensagem não lida de agora.
    .sort((a, b) => {
      const ua = "urgent" in a && a.urgent ? 1 : 0;
      const ub = "urgent" in b && b.urgent ? 1 : 0;
      if (ua !== ub) return ub - ua;
      return b.at.getTime() - a.at.getTime();
    })
    .map(({ at, ...item }) => item);

  // ── Rodapé: números reais, sem inventar "unidades" ou "satisfação" ──────
  const [{ count: collaborators }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(s.workspaceMembers).where(eq(s.workspaceMembers.workspaceId, wsId));
  const conversionRate = resumoOpps.fechadasNoMes > 0
    ? (ganhasNoMes / resumoOpps.fechadasNoMes) * 100
    : null;
  const avgTicket = ganhasNoMes > 0 ? resumoOpps.valorGanhoNoMes / ganhasNoMes : null;

  // ── Ações rápidas — só o que o papel do usuário pode acessar ─────────────
  const allActions: (QuickAction & { needs: boolean })[] = [
    { label: "Novo Lead", href: "/pre-vendas/novo", Icon: UserPlus, needs: can(user.role, "manage_records") },
    { label: "Nova Oportunidade", href: "/oportunidades/nova", Icon: Target, needs: can(user.role, "manage_records") },
    { label: "Campanha", href: "/campanhas", Icon: Megaphone, needs: can(user.role, "use_whatsapp") },
    { label: "Relatório", href: "/relatorios", Icon: FileBarChart, needs: true },
  ];
  const quickActions = allActions.filter((a) => a.needs);

  const comercialContent = (
    <div className="space-y-6">
      <KpiCards kpis={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <FunnelCard stages={funnelStages} wonThisMonth={ganhasNoMes} />
        <SalesChartCard series={salesSeries} />
        <AgendaCard items={agenda} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ActivitiesCard activities={activities} />
        <QuickActionsCard actions={quickActions} />
      </div>

      <FooterBar
        collaborators={Number(collaborators)}
        conversionRate={conversionRate}
        avgTicket={avgTicket}
      />
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-[1500px] mx-auto space-y-6">
      <Header
        greeting={greeting(now)}
        firstName={user.name.split(" ")[0]}
        subtitle="Acompanhe o relacionamento com seus clientes e o desempenho comercial."
        notifications={notifications}
        dateLabel={dateLongBR(now)}
        weekdayLabel={weekdayBR(now)}
      />

      {comercialContent}
    </div>
  );
}

