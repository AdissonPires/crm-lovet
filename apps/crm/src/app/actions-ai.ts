"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { brl } from "@/lib/format";
import { carregarTabelaPrecos, produtoLabel } from "@/lib/produtos";

export type AiResult = { ok: boolean; message: string };

/**
 * Monta uma proposta rascunho a partir do que a oportunidade já diz que o
 * cliente quer, precificado pela tabela de preços (lib/produtos.ts).
 *
 * Isto NÃO usa LLM de propósito: a proposta é aritmética
 * (quantidade × preço do produto), não um problema de dimensionamento. A versão
 * anterior chamava um agente de IA para escolher painel e inversor a partir do
 * consumo em kWh do telhado — herança do CRM solar, sem sentido aqui.
 */
export async function gerarPropostaDeReferencia(opportunityId: string): Promise<AiResult> {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) return { ok: false, message: "Sem permissão." };

  const [opp] = await db.select().from(s.opportunities)
    .where(and(eq(s.opportunities.id, opportunityId), eq(s.opportunities.workspaceId, user.workspaceId)));
  if (!opp) return { ok: false, message: "Oportunidade não encontrada." };
  if (!opp.productLine) {
    return { ok: false, message: "Defina o produto da oportunidade antes de montar a proposta." };
  }

  const tabela = await carregarTabelaPrecos(user.workspaceId);
  const unitPrice = tabela.precoDe(opp.productLine, opp.productVariant);
  if (unitPrice === null) {
    return { ok: false, message: "Sem preço de referência para esse produto — informe o valor manualmente." };
  }

  const qty = opp.productQty && opp.productQty > 0 ? opp.productQty : 1;
  const [last] = await db.select().from(s.proposals)
    .where(eq(s.proposals.opportunityId, opportunityId))
    .orderBy(desc(s.proposals.version)).limit(1);
  const version = (last?.version ?? 0) + 1;
  const descricao = produtoLabel(opp.productLine, opp.productVariant, qty);

  await db.insert(s.proposals).values({
    workspaceId: user.workspaceId,
    opportunityId,
    version,
    productLine: opp.productLine,
    productVariant: opp.productVariant,
    qty,
    unitPrice: unitPrice.toFixed(2),
    validityMonths: 12,
    totalPrice: (qty * unitPrice).toFixed(2),
    financingType: "cash",
    status: "draft",
  });

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "opportunity", relatedToId: opportunityId,
    type: "note",
    payload: { text: `Proposta v${version} montada com preço de referência: ${descricao} a ${brl(unitPrice)} cada.` },
  });

  revalidatePath(`/oportunidades/${opportunityId}`);
  return { ok: true, message: `Proposta rascunho criada: ${descricao}.` };
}
