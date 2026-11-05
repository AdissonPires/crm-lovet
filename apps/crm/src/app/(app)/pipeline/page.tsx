import { redirect } from "next/navigation";
import Link from "next/link";
import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { can } from "@/lib/policy";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { moveOpportunityStage } from "@/app/actions";
import { archiveFunnel, createFunnel, createSector, reorderFunnel, restoreFunnel } from "@/app/actions-funnels";
import { Kanban, type KanbanColumn } from "@/components/Kanban";
import { PipelineFilters, type PipelineFilterValues } from "@/components/pipeline/PipelineFilters";
import { FunnelPicker } from "@/components/funnels/FunnelPicker";
import { loadFunnels, loadSectors, resolveCurrentFunnel } from "@/lib/funnels";
import { brl, daysSince } from "@/lib/format";
import { produtoLabel } from "@/lib/produtos";

export const dynamic = "force-dynamic";

/** Converte "1.234,56" ou "1234.56" em número; vazio/inválido vira null. */
function parseValor(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = parseFloat(raw.replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user.role, "view_pipeline")) redirect("/projetos");

  const sp = await searchParams;
  // Janela do funil: por padrão só o mês vigente (filtro de datas permite
  // ampliar), e nunca antes de 3 meses atrás — o que é mais antigo que isso
  // não é trabalho comercial em jogo.
  const agora = new Date();
  const dia = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const inicioMesPadrao = dia(new Date(agora.getFullYear(), agora.getMonth(), 1));
  const piso3Meses = new Date(agora.getFullYear(), agora.getMonth() - 3, agora.getDate());
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };

  const filters: PipelineFilterValues = {
    q: one("q"),
    owner: one("owner"),
    source: one("source"),
    // Sem escolha explícita o funil mostra só o que está em jogo. Trazer
    // ganhas e perdidas por padrão encheria as colunas terminais com o
    // histórico inteiro e esconderia o trabalho do mês.
    status: one("status") ?? "open",
    de: one("de") ?? inicioMesPadrao,
    ate: one("ate"),
    valorMin: one("valorMin"),
    valorMax: one("valorMax"),
    parados: one("parados"),
  };

  const [funnels, sectors] = await Promise.all([
    loadFunnels(user.workspaceId, "sales"),
    loadSectors(user.workspaceId),
  ]);
  const current = resolveCurrentFunnel(funnels, one("funil"));
  if (!current) redirect("/");

  const stages = await db.select().from(s.pipelineStages)
    .where(eq(s.pipelineStages.pipelineId, current.id)).orderBy(asc(s.pipelineStages.order));

  const isDefaultFunnel = funnels.find((f) => f.id === current.id)?.isDefault ?? false;

  const deFiltro = new Date(`${filters.de}T00:00:00-03:00`);
  const deEfetivo = deFiltro < piso3Meses ? piso3Meses : deFiltro;
  const ate = filters.ate ? new Date(`${filters.ate}T23:59:59-03:00`) : null;

  const allOpps = await db
    .select({
      opp: s.opportunities,
      companyName: s.companies.name,
      ownerName: s.users.name,
    })
    .from(s.opportunities)
    .leftJoin(s.companies, eq(s.companies.id, s.opportunities.companyId))
    .leftJoin(s.users, eq(s.users.id, s.opportunities.ownerId))
    .where(and(
      eq(s.opportunities.workspaceId, user.workspaceId),
      // Oportunidade sem funil definido aparece no padrão, para nenhum negócio
      // antigo ficar invisível depois da chegada dos múltiplos funis.
      isDefaultFunnel
        ? or(eq(s.opportunities.pipelineId, current.id), isNull(s.opportunities.pipelineId))
        : eq(s.opportunities.pipelineId, current.id),
      // Janela de datas no banco (criação), com o piso de 3 meses.
      gte(s.opportunities.createdAt, deEfetivo),
      ate ? lte(s.opportunities.createdAt, ate) : undefined,
      // Situação filtrada já no banco, para não carregar tudo só para mostrar as abertas.
      filters.status === "open" || filters.status === "won" || filters.status === "lost"
        ? eq(s.opportunities.status, filters.status)
        : undefined,
    ));

  // As opções dos selects saem do conjunto completo, não do filtrado: uma
  // origem só some da lista quando não existe mais no funil, nunca por causa
  // do filtro atual — senão o usuário não conseguiria voltar atrás.
  const owners = [...new Map(
    allOpps
      .filter((o) => o.opp.ownerId && o.ownerName)
      .map((o) => [o.opp.ownerId!, { id: o.opp.ownerId!, name: o.ownerName! }]),
  ).values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const sources = [...new Set(allOpps.map((o) => o.opp.leadSource).filter((x): x is string => !!x))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const slaByStage = new Map(stages.map((st) => [st.id, st.slaDays]));
  const valorMin = parseValor(filters.valorMin);
  const valorMax = parseValor(filters.valorMax);
  const termo = filters.q?.toLowerCase();

  const opps = allOpps.filter(({ opp, companyName }) => {
    if (filters.status && filters.status !== "all" && opp.status !== filters.status) return false;
    if (filters.owner && opp.ownerId !== filters.owner) return false;
    if (filters.source && opp.leadSource !== filters.source) return false;

    if (termo) {
      const alvo = `${companyName ?? ""} ${opp.name}`.toLowerCase();
      if (!alvo.includes(termo)) return false;
    }

    const valor = parseFloat(opp.amount ?? "0");
    if (valorMin != null && valor < valorMin) return false;
    if (valorMax != null && valor > valorMax) return false;

    if (filters.parados) {
      const dias = daysSince(opp.stageEnteredAt);
      if (filters.parados === "sla") {
        const sla = slaByStage.get(opp.stageId);
        // Etapa sem SLA definido não tem como estar "fora do prazo".
        if (sla == null || dias <= sla) return false;
      } else {
        const limite = parseInt(filters.parados, 10);
        if (!Number.isNaN(limite) && dias < limite) return false;
      }
    }

    return true;
  });

  const columns: KanbanColumn[] = stages.map((st) => ({
    id: st.id,
    name: st.name,
    probability: st.probability,
    isTerminal: st.isWon || st.isLost,
    totalText: brl(
      opps.filter((o) => o.opp.stageId === st.id)
        .reduce((a, o) => a + parseFloat(o.opp.amount ?? "0"), 0)
    ),
    cards: opps
      .filter((o) => o.opp.stageId === st.id)
      .map((o) => ({
        id: o.opp.id,
        href: `/oportunidades/${o.opp.id}`,
        title: o.companyName ?? o.opp.name,
        subtitle: o.opp.leadSource ?? undefined,
        amount: brl(o.opp.amount),
        badge: produtoLabel(o.opp.productLine, o.opp.productVariant, o.opp.productQty) ?? undefined,
        daysInStage: daysSince(o.opp.stageEnteredAt),
        slaDays: st.slaDays,
        ownerInitials: o.ownerName?.split(" ").map((p) => p[0]).slice(0, 2).join(""),
      })),
  }));

  async function move(cardId: string, toColumnId: string) {
    "use server";
    await moveOpportunityStage(cardId, toColumnId);
  }

  // Wrappers finos: o FunnelPicker é componente de cliente e não pode receber
  // a action importada com o `kind` já aplicado sem passar por aqui.
  async function criarFunil(name: string, sectorId: string | null, color: string) {
    "use server";
    return createFunnel(name, sectorId, color, "sales");
  }
  async function criarSetor(name: string, color: string) {
    "use server";
    return createSector(name, color);
  }
  async function arquivar(id: string) {
    "use server";
    return archiveFunnel(id);
  }
  async function restaurar(id: string) {
    "use server";
    return restoreFunnel(id);
  }
  async function reordenar(id: string, direction: "up" | "down") {
    "use server";
    return reorderFunnel(id, direction);
  }

  // "status" só conta como filtro ativo quando difere do padrão — senão o
  // botão "Limpar" apareceria já na primeira visita, sem nada pra limpar.
  const activeCount = Object.entries(filters)
    .filter(([k, v]) => !!v && !(k === "status" && v === "open") && !(k === "de" && v === inicioMesPadrao)).length;

  const totalFiltrado = opps.reduce((acc, o) => acc + parseFloat(o.opp.amount ?? "0"), 0);
  const rotuloTotal = filters.status === "won" ? "Ganho"
    : filters.status === "lost" ? "Perdido"
    : filters.status === "all" ? "Total" : "Em aberto";

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Pipeline de Vendas</h1>
          <p className="text-sm text-zinc-500 mt-0.5 mb-3">Arraste os cards para mudar de etapa · borda vermelha indica SLA estourado · criadas de {deEfetivo.toLocaleDateString("pt-BR")}{ate ? ` a ${ate.toLocaleDateString("pt-BR")}` : " até hoje"} (máx. 3 meses)</p>
          <FunnelPicker
            funnels={funnels}
            sectors={sectors}
            currentId={current.id}
            basePath="/pipeline"
            onCreate={criarFunil}
            onCreateSector={criarSetor}
            onArchive={arquivar}
            onRestore={restaurar}
            onReorder={reordenar}
          />
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">
              {rotuloTotal}{activeCount > 0 && " (filtrado)"}
            </div>
            <div className="text-lg font-bold text-emerald-700 tabular-nums">{brl(totalFiltrado)}</div>
            <div className="text-[11px] text-zinc-400">{opps.length} negócio{opps.length === 1 ? "" : "s"}</div>
          </div>
          <Link href="/oportunidades/nova"
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-4 py-2.5 hover:bg-zinc-700 shadow-sm transition-colors">
            <Plus className="h-4 w-4" /> Nova oportunidade
          </Link>
        </div>
      </div>

      <PipelineFilters values={filters} owners={owners} sources={sources} activeCount={activeCount} />

      <Kanban columns={columns} moveAction={move} />
    </div>
  );
}
