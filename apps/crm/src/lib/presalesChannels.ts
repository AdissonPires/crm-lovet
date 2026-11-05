export const PRESALES_CHANNELS = [
  { value: "meta_ads", label: "Tráfego pago (Meta)" },
  { value: "google_ads", label: "Tráfego pago (Google)" },
  { value: "social_organic", label: "Mídia social (orgânico)" },
  { value: "prospeccao", label: "Prospecção" },
  { value: "indicacao", label: "Indicação" },
  { value: "whatsapp", label: "WhatsApp direto" },
  { value: "presencial", label: "Presencial (passagem de loja)" },
  { value: "outro", label: "Outro" },
] as const;

export type PresalesChannel = (typeof PRESALES_CHANNELS)[number]["value"];

export function channelLabel(channel: string): string {
  return PRESALES_CHANNELS.find((c) => c.value === channel)?.label ?? channel;
}

// Motivo da visita/contato — combina os dois conjuntos pedidos pelo negócio
// (entrada rápida de passagem de loja + motivo selecionável no cadastro),
// já que na prática é o mesmo campo visto de dois ângulos.
export const VISIT_REASONS = [
  { value: "consulta", label: "Dúvida / consulta" },
  { value: "compra_acessorio", label: "Recompra" },
  { value: "compra_direta", label: "Primeira emissão" },
  { value: "orcamento", label: "Orçamento" },
  { value: "ajustes_manutencao", label: "Problema técnico" },
  { value: "limpeza", label: "Suporte / pós-venda" },
] as const;

export type VisitReason = (typeof VISIT_REASONS)[number]["value"];

export function visitReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return VISIT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

// As etapas do funil ficam em src/lib/presalesFunnel.ts (com SLA e regras).

export const CLASSIFICATION_LABELS: Record<string, string> = {
  quente: "Quente", morno: "Morno", frio: "Frio",
};
