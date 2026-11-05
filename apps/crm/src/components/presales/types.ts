// Forma dos dados que o board de pré-venda consome. A página monta isso a
// partir do banco; os componentes de cliente não conhecem Drizzle.

import type { PresalesStatus, Requirement, SlaState } from "@/lib/presalesFunnel";

export type BoardLead = {
  id: string;
  name: string;
  phone: string;
  status: PresalesStatus;
  city: string | null;
  state: string | null;
  /** O que o lead quer, já legível (ex.: "2× Produto A"). */
  produtoText: string | null;
  /** Origem já com rótulo legível (ex.: "Tráfego pago (Meta) · Instagram"). */
  originLabel: string;
  channel: string;
  classification: string | null;
  /** SDR responsável. */
  ownerName: string | null;
  ownerInitials: string | null;
  closerName: string | null;
  /** Valor estimado da venda, já formatado em R$. */
  estimatedValueText: string | null;
  /** Mesmo valor em número, para somas e totais. */
  estimatedValue: number;
  daysInStage: number;
  sla: SlaState;
  slaDays: number | null;
  /** Dias desde o último contato; null = nunca contatado. */
  daysSinceContact: number | null;
  hasContact: boolean;
  attemptCount: number;
  hasBill: boolean;
  lostReason: string | null;
  /** O que falta para o lead avançar de etapa, calculado no servidor. */
  missingToAdvance: string[];
};

export type BoardColumn = {
  id: PresalesStatus;
  label: string;
  shortLabel: string;
  terminal: boolean;
  isLost: boolean;
  slaDays: number | null;
  /** Campos exigidos para entrar nesta etapa (vazio nas colunas personalizadas). */
  requires: Requirement[];
  /** Coluna criada pelo usuário (não faz parte do funil fixo do SDR). */
  isCustom: boolean;
  /** Total de leads na coluna (após filtros). */
  count: number;
  /** Soma do valor estimado, formatada. */
  estimatedTotalText: string;
  /** Taxa de conversão da etapa (0-100) ou null quando não há histórico. */
  conversionRate: number | null;
  lateCount: number;
  leads: BoardLead[];
};

export type CloserOption = { id: string; name: string };
