// Catálogo de produtos usado nos selects de oportunidades e pré-vendas.
// Ajuste as listas abaixo para o catálogo real da Lovet Distribuidora.

export const PRODUTOS = ["Produto A", "Produto B", "Produto C"] as const;
export const VARIANTES = ["Variante A", "Variante B", "Variante C"] as const;

export type Produto = (typeof PRODUTOS)[number];
export type Variante = (typeof VARIANTES)[number];

/** Rótulo curto do que está sendo vendido: "3× Produto A Variante B". Null quando não há produto. */
export function produtoLabel(
  produto: string | null | undefined,
  variante: string | null | undefined,
  qtd?: number | null,
): string | null {
  if (!produto) return null;
  const tipo = [produto, variante].filter(Boolean).join(" ");
  return qtd && qtd > 1 ? `${qtd}× ${tipo}` : tipo;
}

export type TabelaPrecos = {
  /** Preço unitário de referência, ou null quando não há tabela cadastrada. */
  precoDe(produto: string | null, variante: string | null): number | null;
};

/** Preços por "produto|variante". Preencha conforme a tabela de preços da Lovet. */
const PRECOS: Record<string, number> = {};

export async function carregarTabelaPrecos(_workspaceId: string): Promise<TabelaPrecos> {
  return {
    precoDe(produto, variante) {
      if (!produto) return null;
      return PRECOS[`${produto}|${variante ?? ""}`] ?? null;
    },
  };
}
