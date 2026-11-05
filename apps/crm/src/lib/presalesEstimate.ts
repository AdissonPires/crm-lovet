// Estimativa de valor do lead a partir do que ele precisa.
// Serve para o SDR e o gestor terem noção do tamanho do pipeline de pré-venda
// em reais, antes de existir proposta formal.
//
//   valorR$ = quantidade × preço do tipo (produto + variante)
//
// O preço vem da tabela de preços — ver lib/produtos.ts. A estimativa é síncrona de propósito: o chamador
// carrega a tabela de preços uma vez e precifica a lista inteira de leads sem
// voltar ao banco por item.

import type { TabelaPrecos } from "@/lib/produtos";

export type EstimateInput = {
  productLine?: string | null;
  productVariant?: string | null;
  productQty?: number | null;
};

export type Estimate = { qtd: number; unitPrice: number; value: number } | null;

/** Retorna null quando o lead ainda não tem produto definido ou não há preço de referência. */
export function estimateValor(lead: EstimateInput, tabela: TabelaPrecos): Estimate {
  const unitPrice = tabela.precoDe(lead.productLine ?? null, lead.productVariant ?? null);
  if (unitPrice === null) return null;

  // Sem quantidade informada a intenção de compra ainda existe — assume 1,
  // que é de longe o caso mais comum, em vez de esconder o lead do total.
  const qtd = lead.productQty && lead.productQty > 0 ? lead.productQty : 1;
  return { qtd, unitPrice, value: Math.round(qtd * unitPrice) };
}

/** Soma o valor estimado de uma lista de leads (para o topo das colunas). */
export function sumEstimatedValue(leads: EstimateInput[], tabela: TabelaPrecos): number {
  return leads.reduce((total, lead) => total + (estimateValor(lead, tabela)?.value ?? 0), 0);
}
