"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { PRESALES_STAGES } from "@/lib/presalesFunnel";

export type FunnelResult = { ok: boolean; error?: string };

/**
 * Etapas com que um funil novo nasce, por tipo.
 *
 * Criar funil vazio seria pior que não criar: o quadro abriria sem nenhuma
 * coluna e o usuário teria que montar tudo antes de usar. Estes padrões são os
 * mesmos que o seed usa, então funil novo já vem utilizável.
 */
const DEFAULT_STAGES = {
  /**
   * Venda ao cliente final. Termina em "Ganho" de propósito: o pós-venda
   * (cobrança, entrega) não é modelado neste funil.
   */
  // Etapas: 1 Negociação, 2 Cobrança enviada, 3 Ganho, 4 Perdido.
  sales: [
    { name: "Negociação", probability: 40, slaDays: 5 },
    { name: "Cobrança enviada", probability: 70, slaDays: 5 },
    { name: "Ganho", probability: 100, slaDays: null, isWon: true },
    { name: "Perdido", probability: 0, slaDays: null, isLost: true },
  ],
  /**
   * Captação de parceiro (revendedor / representante).
   */
  partners: [
    { name: "Prospecção", probability: 10, slaDays: 5 },
    { name: "Contato / apresentação", probability: 25, slaDays: 5 },
    { name: "Proposta de parceria", probability: 50, slaDays: 7 },
    { name: "Credenciamento / documentação", probability: 75, slaDays: 10 },
    { name: "Parceiro ativado", probability: 100, slaDays: null, isWon: true },
    { name: "Não avançou", probability: 0, slaDays: null, isLost: true },
  ],
  // O funil de SDR usa as etapas fixas de presalesFunnel.ts, que continuam
  // sendo a fonte da verdade das regras (SLA, campos obrigatórios). Aqui elas
  // só são materializadas para o funil ter colunas próprias.
  presales: PRESALES_STAGES.map((st, i) => ({
    name: st.shortLabel,
    probability: Math.round((i / Math.max(PRESALES_STAGES.length - 1, 1)) * 100),
    slaDays: st.slaDays,
    isWon: st.id === "convertido",
    isLost: st.isLost ?? false,
  })),
} as const;

/** Conjunto de etapas com que o funil nasce. */
export type StageTemplate = keyof typeof DEFAULT_STAGES;
/** `pipelines.kind` — o enum do banco, que governa o comportamento do funil. */
type FunnelKind = "sales" | "presales";

/**
 * `template` é separado de `kind` porque existem dois funis de venda com
 * etapas bem diferentes (venda direta e captação de parceiros) que, para o
 * resto do app, são os dois `kind: "sales"` — o dashboard, por exemplo,
 * procura o funil de vendas padrão por `kind`.
 */
export async function createFunnel(
  name: string,
  sectorId: string | null,
  color: string,
  kind: FunnelKind = "sales",
  template: StageTemplate = kind,
): Promise<FunnelResult> {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) return { ok: false, error: "Sem permissão." };
  if (!name.trim()) return { ok: false, error: "Informe o nome do funil." };

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${s.pipelines.sortOrder}), 0)::int` })
    .from(s.pipelines)
    .where(and(eq(s.pipelines.workspaceId, user.workspaceId), eq(s.pipelines.kind, kind)));

  const [pipe] = await db.insert(s.pipelines).values({
    workspaceId: user.workspaceId,
    name: name.trim(),
    kind,
    sectorId,
    color,
    sortOrder: maxOrder + 1,
  }).returning();

  await db.insert(s.pipelineStages).values(
    DEFAULT_STAGES[template].map((st, i) => ({
      pipelineId: pipe.id,
      name: st.name,
      order: i + 1,
      probability: st.probability,
      slaDays: st.slaDays ?? null,
      isWon: "isWon" in st ? !!st.isWon : false,
      isLost: "isLost" in st ? !!st.isLost : false,
    })),
  );

  revalidatePath("/pipeline");
  revalidatePath("/pre-vendas");
  return { ok: true };
}

export async function createSector(name: string, color: string): Promise<FunnelResult> {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) return { ok: false, error: "Sem permissão." };
  if (!name.trim()) return { ok: false, error: "Informe o nome do setor." };

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${s.sectors.sortOrder}), 0)::int` })
    .from(s.sectors)
    .where(eq(s.sectors.workspaceId, user.workspaceId));

  await db.insert(s.sectors).values({
    workspaceId: user.workspaceId,
    name: name.trim(),
    color,
    sortOrder: maxOrder + 1,
  });

  revalidatePath("/pipeline");
  revalidatePath("/pre-vendas");
  return { ok: true };
}

/**
 * Move o funil pra lixeira. Não apaga: as oportunidades dele apontam para
 * suas etapas, e remover de verdade quebraria o histórico de negócio fechado.
 */
export async function archiveFunnel(pipelineId: string): Promise<FunnelResult> {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) return { ok: false, error: "Sem permissão." };

  const [pipe] = await db.select().from(s.pipelines)
    .where(and(eq(s.pipelines.id, pipelineId), eq(s.pipelines.workspaceId, user.workspaceId)));
  if (!pipe) return { ok: false, error: "Funil não encontrado." };
  if (pipe.isDefault) return { ok: false, error: "O funil padrão não pode ir para a lixeira." };

  // Deixar o workspace sem nenhum funil ativo do tipo tornaria a tela
  // inacessível — sem quadro para abrir, e sem como criar outro pela própria
  // tela que deixou de existir.
  const [{ ativos }] = await db
    .select({ ativos: sql<number>`count(*)::int` })
    .from(s.pipelines)
    .where(and(
      eq(s.pipelines.workspaceId, user.workspaceId),
      eq(s.pipelines.kind, pipe.kind),
      isNull(s.pipelines.archivedAt),
    ));
  if (ativos <= 1) return { ok: false, error: "Este é o último funil ativo — crie outro antes de arquivar." };

  await db.update(s.pipelines).set({ archivedAt: new Date() }).where(eq(s.pipelines.id, pipelineId));

  revalidatePath("/pipeline");
  revalidatePath("/pre-vendas");
  return { ok: true };
}

export async function restoreFunnel(pipelineId: string): Promise<FunnelResult> {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) return { ok: false, error: "Sem permissão." };

  await db.update(s.pipelines).set({ archivedAt: null })
    .where(and(eq(s.pipelines.id, pipelineId), eq(s.pipelines.workspaceId, user.workspaceId)));

  revalidatePath("/pipeline");
  revalidatePath("/pre-vendas");
  return { ok: true };
}

/**
 * Sobe ou desce o funil na lista, trocando a ordem com o vizinho do MESMO
 * setor — reordenar entre setores diferentes não faria sentido visual, já que
 * a lista é agrupada.
 */
export async function reorderFunnel(pipelineId: string, direction: "up" | "down"): Promise<FunnelResult> {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) return { ok: false, error: "Sem permissão." };

  const [alvo] = await db.select().from(s.pipelines)
    .where(and(eq(s.pipelines.id, pipelineId), eq(s.pipelines.workspaceId, user.workspaceId)));
  if (!alvo) return { ok: false, error: "Funil não encontrado." };

  const irmaos = await db.select().from(s.pipelines)
    .where(and(
      eq(s.pipelines.workspaceId, user.workspaceId),
      eq(s.pipelines.kind, alvo.kind),
      isNull(s.pipelines.archivedAt),
      alvo.sectorId ? eq(s.pipelines.sectorId, alvo.sectorId) : isNull(s.pipelines.sectorId),
    ))
    .orderBy(asc(s.pipelines.sortOrder), asc(s.pipelines.createdAt));

  const idx = irmaos.findIndex((p) => p.id === pipelineId);
  const vizinhoIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || vizinhoIdx < 0 || vizinhoIdx >= irmaos.length) return { ok: true };

  const vizinho = irmaos[vizinhoIdx];
  // Troca direta: dois updates bastam porque a ordem é só entre estes dois.
  await db.update(s.pipelines).set({ sortOrder: vizinho.sortOrder }).where(eq(s.pipelines.id, alvo.id));
  await db.update(s.pipelines).set({ sortOrder: alvo.sortOrder }).where(eq(s.pipelines.id, vizinho.id));

  revalidatePath("/pipeline");
  revalidatePath("/pre-vendas");
  return { ok: true };
}
