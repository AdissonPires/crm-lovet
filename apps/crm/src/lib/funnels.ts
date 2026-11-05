import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { FunnelItem } from "@/components/funnels/FunnelPicker";

/**
 * Carrega os funis de um tipo para o seletor, já com setor, cor e contagem.
 *
 * Traz arquivados também: o painel precisa deles para a aba "Lixeira", e
 * fazer uma segunda consulta só pra isso seria desperdício — o volume de
 * funis é pequeno por natureza (dezenas, não milhares).
 */
export async function loadFunnels(
  workspaceId: string,
  kind: "sales" | "installation" | "presales",
): Promise<FunnelItem[]> {
  const rows = await db
    .select({
      pipe: s.pipelines,
      sectorName: s.sectors.name,
      sectorColor: s.sectors.color,
    })
    .from(s.pipelines)
    .leftJoin(s.sectors, eq(s.sectors.id, s.pipelines.sectorId))
    .where(and(eq(s.pipelines.workspaceId, workspaceId), eq(s.pipelines.kind, kind)))
    .orderBy(asc(s.pipelines.sortOrder), asc(s.pipelines.createdAt));

  // Contagem por funil numa consulta só, em vez de uma por funil.
  const counts = kind === "presales"
    ? await db
        .select({ id: s.presalesLeads.pipelineId, total: sql<number>`count(*)::int` })
        .from(s.presalesLeads)
        .where(eq(s.presalesLeads.workspaceId, workspaceId))
        .groupBy(s.presalesLeads.pipelineId)
    : await db
        .select({ id: s.opportunities.pipelineId, total: sql<number>`count(*)::int` })
        .from(s.opportunities)
        .where(and(eq(s.opportunities.workspaceId, workspaceId), eq(s.opportunities.status, "open")))
        .groupBy(s.opportunities.pipelineId);

  const countByPipe = new Map(counts.map((c) => [c.id, c.total]));
  const padrao = rows.find((r) => r.pipe.isDefault)?.pipe.id;

  // Lead/oportunidade sem funil definido conta para o funil padrão — é onde
  // eles aparecem no quadro, então a contagem tem que refletir isso.
  const semFunil = countByPipe.get(null) ?? 0;

  return rows.map(({ pipe, sectorName, sectorColor }) => {
    const stages = countByPipe.get(pipe.id) ?? 0;
    return {
      id: pipe.id,
      name: pipe.name,
      color: pipe.color,
      sectorId: pipe.sectorId,
      sectorName: sectorName ?? null,
      sectorColor: sectorColor ?? null,
      isDefault: pipe.isDefault,
      // Marcadores visuais do seletor, inferidos do nome — o mesmo que a
      // referência faz: funil cujo nome indica perda ganha o ícone.
      isLossFunnel: /perd|descart|lixo/i.test(pipe.name),
      receivesTransfer: /financeiro|p[óo]s|nutri|entrega/i.test(pipe.name),
      archived: pipe.archivedAt != null,
      count: pipe.id === padrao ? stages + semFunil : stages,
    };
  });
}

/** Setores do workspace, para o formulário de criação de funil. */
export async function loadSectors(workspaceId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: s.sectors.id, name: s.sectors.name })
    .from(s.sectors)
    .where(eq(s.sectors.workspaceId, workspaceId))
    .orderBy(asc(s.sectors.sortOrder), asc(s.sectors.name));
}

/**
 * Resolve qual funil abrir: o pedido na URL, senão o padrão, senão o primeiro
 * ativo. Devolve null quando não existe nenhum funil ativo do tipo.
 */
export function resolveCurrentFunnel(funnels: FunnelItem[], requested?: string): FunnelItem | null {
  const ativos = funnels.filter((f) => !f.archived);
  if (ativos.length === 0) return null;
  // Um funil arquivado pedido na URL não deve abrir: o link pode ter sido
  // salvo antes do arquivamento.
  const pedido = requested ? ativos.find((f) => f.id === requested) : undefined;
  return pedido ?? ativos.find((f) => f.isDefault) ?? ativos[0];
}
