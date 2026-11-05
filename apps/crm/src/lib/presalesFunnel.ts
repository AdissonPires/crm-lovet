// Funil de pré-venda (SDR): fonte única das etapas, dos SLAs e dos campos
// obrigatórios para avançar. Usado no servidor (validação de verdade, em
// actions-presales.ts) e no cliente (para bloquear o arraste antes de mexer
// na tela). Não importa nada do banco — só tipos simples.

// União das etapas fixas — usada para checagens exaustivas de casos especiais
// (ex.: "convertido" exige promoteToOpportunity). Colunas personalizadas
// (ver customStagesFromSettings) têm id livre, por isso o tipo usado no resto
// do app é `PresalesStatus = string`.
export type BasePresalesStatus =
  | "sem_contato"
  | "em_contato"
  | "qualificacao"
  | "aguardando_vendedor"
  | "convertido"
  | "incompativel";

export type PresalesStatus = string;

// Cada requisito tem um teste e um rótulo explicando o que falta ao usuário.
export type Requirement =
  | "contactAttempt"
  | "contacted"
  | "certificate"
  | "location"
  | "bill"
  | "lostReason";

export type PresalesStage = {
  id: PresalesStatus;
  label: string;
  shortLabel: string;
  /** Dias tolerados na etapa antes de acusar atraso. null = etapa terminal. */
  slaDays: number | null;
  terminal?: boolean;
  requires: readonly Requirement[];
  /** Etapa que representa perda/descarte — não conta como avanço no funil. */
  isLost?: boolean;
};

export const PRESALES_STAGES: readonly PresalesStage[] = [
  {
    id: "sem_contato",
    label: "Sem contato / Novo lead",
    shortLabel: "Sem contato",
    slaDays: 1,
    requires: [],
  },
  {
    id: "em_contato",
    label: "Em contato / Tentativa",
    shortLabel: "Em contato",
    slaDays: 3,
    requires: ["contactAttempt"],
  },
  {
    id: "qualificacao",
    label: "Qualificação / Coleta de documentos",
    shortLabel: "Qualificação",
    slaDays: 5,
    requires: ["contacted"],
  },
  {
    id: "aguardando_vendedor",
    label: "Aguardando vendedor / Qualificado",
    shortLabel: "Aguardando vendedor",
    slaDays: 2,
    requires: ["certificate", "location", "bill"],
  },
  {
    id: "convertido",
    label: "Convertido",
    shortLabel: "Convertido",
    slaDays: null,
    terminal: true,
    requires: [],
  },
  {
    id: "incompativel",
    label: "Lead incompatível / Perdido",
    shortLabel: "Incompatível",
    slaDays: null,
    terminal: true,
    isLost: true,
    requires: ["lostReason"],
  },
] as const;

export function stageById(id: string, stages: readonly PresalesStage[] = PRESALES_STAGES): PresalesStage | undefined {
  return stages.find((s) => s.id === id);
}

export function stageLabel(id: string, stages: readonly PresalesStage[] = PRESALES_STAGES): string {
  return stageById(id, stages)?.label ?? id;
}

/** Posição da etapa no funil — usada para saber o que é "avanço". */
export function stageIndex(id: string, stages: readonly PresalesStage[] = PRESALES_STAGES): number {
  return stages.findIndex((s) => s.id === id);
}

// ─── Colunas personalizadas ──────────────────────────────────────────────────
// Além das etapas fixas do funil (com regras e SLA), o workspace pode criar
// colunas extras livres (sem campo obrigatório, sem SLA) para organizar o
// quadro do seu jeito. Ficam em `workspaces.settings.presales.customStages`.

export type CustomStage = { id: string; label: string };

const MAX_CUSTOM_STAGES = 12;

export function customStagesFromSettings(settings: unknown): CustomStage[] {
  const raw = (settings as { presales?: { customStages?: unknown } } | null)?.presales?.customStages;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c): c is CustomStage =>
        !!c && typeof c === "object" && typeof (c as CustomStage).id === "string" && typeof (c as CustomStage).label === "string"
    )
    .slice(0, MAX_CUSTOM_STAGES);
}

/** Gera um id estável (slug) a partir do nome digitado pelo usuário. */
export function slugifyStageId(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "etapa";
}

/**
 * Monta a lista completa de etapas (fixas + personalizadas) na ordem exibida
 * no quadro. As colunas novas entram antes de "Aguardando vendedor" — depois
 * da qualificação, mas antes da passagem de bastão, que tem regras próprias.
 */
export function buildStages(custom: readonly CustomStage[]): PresalesStage[] {
  const insertAt = PRESALES_STAGES.findIndex((st) => st.id === "aguardando_vendedor");
  const customFull: PresalesStage[] = custom.map((c) => ({
    id: c.id,
    label: c.label,
    shortLabel: c.label,
    slaDays: null,
    requires: [],
  }));
  return [
    ...PRESALES_STAGES.slice(0, insertAt),
    ...customFull,
    ...PRESALES_STAGES.slice(insertAt),
  ];
}

// ─── Validação de transição ──────────────────────────────────────────────────

/** Campos do lead que a validação precisa — subconjunto de presalesLeads. */
export type LeadForValidation = {
  attemptCount?: number | null;
  lastContactAt?: Date | string | null;
  productLine?: string | null;
  state?: string | null;
  billFileUrl?: string | null;
  billReceivedAt?: Date | string | null;
  prescriptionDate?: Date | string | null;
  lostReason?: string | null;
};

const REQUIREMENTS: Record<Requirement, { label: string; test: (l: LeadForValidation) => boolean }> = {
  contactAttempt: {
    label: "registrar ao menos uma tentativa de contato",
    test: (l) => (l.attemptCount ?? 0) > 0 || l.lastContactAt != null,
  },
  contacted: {
    label: "registrar o contato com o cliente",
    test: (l) => l.lastContactAt != null,
  },
  certificate: {
    label: "produto que o cliente precisa",
    test: (l) => !!l.productLine?.trim(),
  },
  location: {
    label: "UF do cliente (necessária para o orçamento)",
    test: (l) => !!l.state?.trim(),
  },
  bill: {
    label: "dados do cliente (documento, confirmação de recebimento ou data prevista de recompra)",
    test: (l) => !!l.billFileUrl?.trim() || l.billReceivedAt != null || l.prescriptionDate != null,
  },
  lostReason: {
    label: "motivo da incompatibilidade",
    test: (l) => !!l.lostReason?.trim(),
  },
};

export type TransitionResult = { ok: boolean; missing: string[] };

/**
 * Diz se o lead pode entrar na etapa destino. Voltar no funil ou ficar na
 * mesma etapa nunca é bloqueado — a exigência vale para avançar e para
 * marcar como incompatível (que pede motivo).
 */
export function validateTransition(
  lead: LeadForValidation,
  fromStatus: string,
  toStatus: string,
  stages: readonly PresalesStage[] = PRESALES_STAGES
): TransitionResult {
  const to = stageById(toStatus, stages);
  if (!to) return { ok: false, missing: ["etapa de destino inválida"] };

  const isAdvancing = stageIndex(toStatus, stages) > stageIndex(fromStatus, stages);
  // Voltar etapa é livre; só "incompatível" exige motivo mesmo vindo de trás.
  if (!isAdvancing && !to.isLost) return { ok: true, missing: [] };

  const missing = to.requires
    .filter((r) => !REQUIREMENTS[r].test(lead))
    .map((r) => REQUIREMENTS[r].label);

  return { ok: missing.length === 0, missing };
}

// ─── SLA ─────────────────────────────────────────────────────────────────────

export type SlaState = "ok" | "atrasado" | "sem_sla";

export function slaState(
  status: string,
  stageEnteredAt: Date | string | null,
  stages: readonly PresalesStage[] = PRESALES_STAGES
): SlaState {
  const stage = stageById(status, stages);
  if (!stage || stage.slaDays == null || !stageEnteredAt) return "sem_sla";
  const days = Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / 86400000);
  return days > stage.slaDays ? "atrasado" : "ok";
}
