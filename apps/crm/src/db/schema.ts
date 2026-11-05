import {
  pgSchema, uuid, text, timestamp, integer, boolean, numeric, jsonb, date, uniqueIndex, index,
} from "drizzle-orm/pg-core";

// Todas as tabelas do CRM vivem no schema "crm" — e
// nenhum dos dois enxerga o do outro (ver design do ecossistema).
// O alias abaixo mantém as definições abaixo inalteradas.
export const crmSchema = pgSchema("crm");
const pgTable = crmSchema.table;

// ─── Tenancy ────────────────────────────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("trial"),
  status: text("status").notNull().default("active"),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["owner", "admin", "admin2", "manager", "rep", "sdr", "installer", "viewer"] }).notNull(),
  status: text("status").notNull().default("active"),
  // Equipe interna (ex.: "Equipe Alfa") — não é filial/local, é
  // time dentro da mesma empresa. Texto livre de propósito: equipe nova é
  // operação do dia a dia, não deveria exigir migração de schema.
  equipe: text("equipe"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("uq_member").on(t.workspaceId, t.userId)]);

// ─── CRM core ───────────────────────────────────────────────────────────────

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  domain: text("domain"),
  industry: text("industry"),
  size: text("size"),
  ownerId: uuid("owner_id").references(() => users.id),
  customFields: jsonb("custom_fields").notNull().default({}),
  // CPF/CNPJ (só dígitos) do cliente.
  documento: text("documento"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [
  index("ix_companies_ws").on(t.workspaceId),
  uniqueIndex("uq_companies_documento").on(t.workspaceId, t.documento),
]);

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  companyId: uuid("company_id").references(() => companies.id),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  cpf: text("cpf"),
  birthDate: timestamp("birth_date"),
  title: text("title"),
  // Ano em que a mensagem de aniversário automática já foi enviada — evita
  // reenviar no mesmo dia se a rotina rodar mais de uma vez, sem precisar de
  // uma tabela de log só pra isso.
  lastBirthdayMessageYear: integer("last_birthday_message_year"),
  ownerId: uuid("owner_id").references(() => users.id),
  customFields: jsonb("custom_fields").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [
  index("ix_contacts_ws").on(t.workspaceId),
]);

// ─── Pipelines ──────────────────────────────────────────────────────────────

/**
 * Setor que agrupa funis na barra lateral (ex.: "Comercial", "Pós-venda",
 * "Loja Cidade Nova").
 *
 * Existe porque uma operação com muitos funis vira uma lista ilegível: sem
 * agrupamento, escolher "Nutrição Motos" entre trinta funis é caçar linha por
 * linha. Funil sem setor cai no grupo "Sem setor", que aparece primeiro.
 */
export const sectors = pgTable("sectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  /** Cor do marcador do setor (hex). */
  color: text("color").notNull().default("#71717a"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_sectors_ws").on(t.workspaceId)]);

export const pipelines = pgTable("pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  // "presales" entrou junto com os múltiplos funis: antes a pré-venda tinha um
  // único quadro com etapas fixas no código (lib/presalesFunnel.ts). Agora cada
  // funil de SDR é uma linha aqui, do mesmo jeito que os de venda.
  kind: text("kind", { enum: ["sales", "installation", "presales"] }).notNull().default("sales"),
  isDefault: boolean("is_default").notNull().default(false),
  /** Setor que agrupa este funil na lista. Nulo = "Sem setor". */
  sectorId: uuid("sector_id").references(() => sectors.id),
  /** Cor do marcador do funil na lista (hex). */
  color: text("color").notNull().default("#8b5cf6"),
  sortOrder: integer("sort_order").notNull().default(0),
  /**
   * Lixeira: funil arquivado sai da lista mas não é apagado, porque as
   * oportunidades dele continuam existindo e referenciando suas etapas.
   * Excluir de verdade quebraria histórico de negócio fechado.
   */
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_pipelines_ws").on(t.workspaceId, t.kind)]);

export const pipelineStages = pgTable("pipeline_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id),
  name: text("name").notNull(),
  order: integer("order").notNull(),
  probability: integer("probability").notNull().default(0),
  isWon: boolean("is_won").notNull().default(false),
  isLost: boolean("is_lost").notNull().default(false),
  slaDays: integer("sla_days"),
}, (t) => [uniqueIndex("uq_stage_order").on(t.pipelineId, t.order)]);

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id),
  stageId: uuid("stage_id").notNull().references(() => pipelineStages.id),
  companyId: uuid("company_id").references(() => companies.id),
  primaryContactId: uuid("primary_contact_id").references(() => contacts.id),
  ownerId: uuid("owner_id").references(() => users.id),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  productLine: text("product_line"),
  productVariant: text("product_variant"),
  productQty: integer("product_qty"),
  leadSource: text("lead_source"),
  expectedCloseDate: timestamp("expected_close_date"),
  closedAt: timestamp("closed_at"),
  status: text("status", { enum: ["open", "won", "lost"] }).notNull().default("open"),
  lostReason: text("lost_reason"),
  stageEnteredAt: timestamp("stage_entered_at").notNull().defaultNow(),
  customFields: jsonb("custom_fields").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("ix_opps_ws").on(t.workspaceId),
  index("ix_opps_stage").on(t.stageId),
]);

export const opportunityStageHistory = pgTable("opportunity_stage_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id),
  fromStageId: uuid("from_stage_id").references(() => pipelineStages.id),
  toStageId: uuid("to_stage_id").notNull().references(() => pipelineStages.id),
  changedBy: uuid("changed_by").references(() => users.id),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
  timeInStageSeconds: integer("time_in_stage_seconds"),
});

// ─── Tasks & activities ─────────────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  relatedToType: text("related_to_type", { enum: ["company", "contact", "opportunity", "installation_project", "presales_lead"] }),
  relatedToId: uuid("related_to_id"),
  assigneeId: uuid("assignee_id").references(() => users.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdByAgent: boolean("created_by_agent").notNull().default(false),
  type: text("type", { enum: ["call", "email", "meeting", "visit", "todo"] }).notNull().default("todo"),
  title: text("title").notNull(),
  dueAt: timestamp("due_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_tasks_ws").on(t.workspaceId)]);

/**
 * Reunião gravada e analisada pela IA.
 *
 * O áudio NÃO fica no banco: vai para disco (mesmo padrão da mídia de
 * campanha) e aqui guarda-se só o caminho. Uma reunião de 40 minutos em
 * webm/opus passa de 20 MB, e carregar isso como bytea em toda listagem
 * derrubaria a página.
 *
 * O processamento tem três etapas persistidas em `status`, porque cada uma
 * pode levar minutos e falhar por conta própria: transcrever no Whisper e
 * analisar no Ollama. Guardar o estágio permite retomar de onde parou em vez
 * de gravar tudo de novo — o áudio é a parte que não dá para refazer.
 */
export const meetingNotes = pgTable("meeting_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  title: text("title").notNull(),
  // Vínculo opcional: a reunião pode ser de uma oportunidade ou avulsa.
  relatedToType: text("related_to_type", { enum: ["opportunity", "company", "contact"] }),
  relatedToId: uuid("related_to_id"),
  audioPath: text("audio_path"),
  audioMime: text("audio_mime"),
  durationSec: integer("duration_sec"),
  transcript: text("transcript"),
  /**
   * Saída estruturada da IA: { resumo, topicos[], insights[], decisoes[],
   * participantes[], pendencias[] }. Fica em jsonb, e não em colunas, porque
   * é conteúdo para leitura — nada aqui é filtrado ou agregado em consulta.
   */
  analysis: jsonb("analysis"),
  status: text("status", {
    enum: ["pendente", "transcrevendo", "analisando", "pronto", "erro"],
  }).notNull().default("pendente"),
  errorMessage: text("error_message"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_meeting_notes_ws").on(t.workspaceId, t.createdAt)]);

/**
 * Encaminhamento saído da reunião: "quem ficou com o quê".
 *
 * Existe à parte de `tasks` porque a IA devolve o responsável como NOME falado
 * ("o Bruno fica com o contrato"), e esse nome pode não casar com nenhum
 * usuário — reunião tem gente de fora. Guardar `ownerName` cru preserva o que
 * foi dito; `taskId` só é preenchido quando o nome casou com alguém do
 * workspace e virou tarefa de verdade. Sem isso, todo encaminhamento de
 * participante externo seria descartado no ato da análise.
 */
export const meetingActionItems = pgTable("meeting_action_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  meetingNoteId: uuid("meeting_note_id").notNull().references(() => meetingNotes.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  ownerName: text("owner_name"),
  ownerId: uuid("owner_id").references(() => users.id),
  dueHint: text("due_hint"),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_meeting_items_note").on(t.meetingNoteId)]);

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  actorId: uuid("actor_id").references(() => users.id),
  actorType: text("actor_type", { enum: ["user", "system", "ai_agent"] }).notNull().default("user"),
  relatedToType: text("related_to_type").notNull(),
  relatedToId: uuid("related_to_id").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_activities_rel").on(t.relatedToType, t.relatedToId)]);

// ─── Solar vertical ─────────────────────────────────────────────────────────

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  companyId: uuid("company_id").references(() => companies.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  address: text("address").notNull(),
  city: text("city"),
  state: text("state"),
  roofType: text("roof_type"),
  roofAreaM2: numeric("roof_area_m2", { precision: 8, scale: 1 }),
  utilityCompany: text("utility_company"),
  tariffClass: text("tariff_class"),
  avgMonthlyConsumptionKwh: integer("avg_monthly_consumption_kwh"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const siteSurveys = pgTable("site_surveys", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id),
  surveyorId: uuid("surveyor_id").references(() => users.id),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  technicalFeasibility: text("technical_feasibility", { enum: ["pending", "viable", "not_viable", "needs_reinforcement"] }).notNull().default("pending"),
  structuralNotes: text("structural_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const proposals = pgTable("proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id),
  version: integer("version").notNull().default(1),
  // Mesmos valores de `opportunities.productLine`/`productVariant`.
  productLine: text("product_line").notNull(),
  productVariant: text("product_variant"),
  qty: integer("qty").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
  /** Prazo/validade em meses — vira preço diferente. */
  validityMonths: integer("validity_months"),
  totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
  financingType: text("financing_type", { enum: ["cash", "financing", "leasing"] }).notNull().default("cash"),
  installments: integer("installments"),
  status: text("status", { enum: ["draft", "sent", "accepted", "rejected"] }).notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const installationProjects = pgTable("installation_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id).unique(),
  siteId: uuid("site_id").references(() => sites.id),
  projectManagerId: uuid("project_manager_id").references(() => users.id),
  installerId: uuid("installer_id").references(() => users.id),
  stageId: uuid("stage_id").notNull().references(() => pipelineStages.id),
  permitStatus: text("permit_status", { enum: ["pending", "submitted", "approved"] }).notNull().default("pending"),
  utilityApprovalStatus: text("utility_approval_status", { enum: ["pending", "submitted", "approved"] }).notNull().default("pending"),
  installationScheduledAt: timestamp("installation_scheduled_at"),
  installationCompletedAt: timestamp("installation_completed_at"),
  warrantyStartDate: timestamp("warranty_start_date"),
  stageEnteredAt: timestamp("stage_entered_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── MÓDULO PRÉ-VENDAS ────────────────────────────────────────────────────────

// Esteira do SDR. As etapas, seus SLAs e os campos obrigatórios para avançar
// ficam em src/lib/presalesFunnel.ts (fonte única, usada no servidor e na UI).
export const presalesLeads = pgTable("presales_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  channel: text("channel", {
    enum: ["meta_ads", "google_ads", "social_organic", "prospeccao", "indicacao", "whatsapp", "presencial", "outro"],
  }).notNull().default("outro"),
  socialNetwork: text("social_network"),
  classification: text("classification", { enum: ["quente", "morno", "frio"] }),
  // Texto livre (não enum) de propósito: além das etapas fixas do funil, o
  // workspace pode criar colunas personalizadas (ver presalesFunnel.ts).
  status: text("status").notNull().default("sem_contato"),
  /**
   * Funil de pré-venda a que este lead pertence (kind = "presales").
   * Nulo = funil padrão, o comportamento de antes dos múltiplos funis — assim
   * lead antigo continua aparecendo sem precisar de migração de dados.
   */
  pipelineId: uuid("pipeline_id").references(() => pipelines.id),
  // ownerId = SDR responsável pelo lead.
  ownerId: uuid("owner_id").references(() => users.id),
  notes: text("notes"),
  // Motivo da visita/contato — obrigatório pra abordagem presencial (passagem
  // de loja), opcional nos demais canais. Ver VISIT_REASONS em presalesChannels.ts.
  visitReason: text("visit_reason"),
  // Custo por lead (mídia paga) — referência de mercado R$0,33, editável por lead.
  costPerLead: numeric("cost_per_lead", { precision: 10, scale: 2 }).default("0.33"),
  // Confirmação LGPD disparada automaticamente na criação do lead — guarda
  // quando foi enviada pra nunca reenviar duas vezes no mesmo lead.
  lgpdConsentSentAt: timestamp("lgpd_consent_sent_at"),
  // Follow-up automático 30 dias após a entrada do lead no sistema — guarda
  // quando foi enviado pra a rotina (cron) não repetir.
  postEntryFollowupSentAt: timestamp("post_entry_followup_sent_at"),

  // O que o lead precisa — base da estimativa de valor da pré-venda
  // (ver lib/presalesEstimate.ts). Mesmos valores de
  // `opportunities.productLine`/`productVariant`.
  productLine: text("product_line"),
  productVariant: text("product_variant"),
  productQty: integer("product_qty"),

  city: text("city"),
  state: text("state"),
  // Local onde o titular será atendido/validado (loja própria, parceiro
  // contador, etc.) — antes gravado por engano em `utilityCompany` (coluna de
  // distribuidora de energia, resquício solar), com a UI já rotulada
  // corretamente como "Ponto de atendimento". Corrigido em 26/09/2026.
  pontoAtendimento: text("ponto_atendimento"),
  // Resquícios do vertical solar (consumo/conta de luz). Não alimentam mais
  // nada desde a correção de 26/09/2026 (ver `pontoAtendimento` e
  // `productQty` acima/abaixo) — ficam só para não perder o histórico dos
  // leads antigos.
  utilityCompany: text("utility_company"),
  avgMonthlyConsumptionKwh: integer("avg_monthly_consumption_kwh"),
  avgBillAmount: numeric("avg_bill_amount", { precision: 10, scale: 2 }),
  billFileUrl: text("bill_file_url"),
  billReceivedAt: timestamp("bill_received_at"),
  // Data prevista de recompra do cliente — diferente
  // de billReceivedAt (quando a LOJA recebeu o arquivo). Ter uma receita
  // cadastrada (esta data OU o link/confirmação de recebimento) já satisfaz
  // o requisito "bill" do funil — ver REQUIREMENTS.bill em presalesFunnel.ts.
  prescriptionDate: timestamp("prescription_date"),

  // Operação do SDR / base do SLA
  stageEnteredAt: timestamp("stage_entered_at").notNull().defaultNow(),
  lastContactAt: timestamp("last_contact_at"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lostReason: text("lost_reason"),

  // Passagem de bastão para o vendedor de fechamento
  closerId: uuid("closer_id").references(() => users.id),
  handedOffAt: timestamp("handed_off_at"),

  convertedOpportunityId: uuid("converted_opportunity_id").references(() => opportunities.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("ix_presales_ws").on(t.workspaceId)]);

// Evento de "passagem de bastão": o SDR qualificou e entregou o lead a um
// vendedor. Tabela própria (em vez de `commissions`, que exige opportunityId)
// para registrar o crédito do SDR já na entrega, antes de existir a venda.
export const presalesHandoffs = pgTable("presales_handoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  leadId: uuid("lead_id").notNull().references(() => presalesLeads.id),
  sdrId: uuid("sdr_id").references(() => users.id),
  closerId: uuid("closer_id").references(() => users.id),
  commissionAmount: numeric("commission_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  // Fotografia da estimativa no momento da entrega (não recalcula depois).
  estimatedQty: integer("estimated_qty"),
  estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
  status: text("status", { enum: ["pending", "accepted", "returned"] }).notNull().default("pending"),
  acceptedAt: timestamp("accepted_at"),
  returnedAt: timestamp("returned_at"),
  returnReason: text("return_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ix_presales_handoffs_ws").on(t.workspaceId),
  index("ix_presales_handoffs_lead").on(t.leadId),
]);

// ─── WhatsApp ───────────────────────────────────────────────────────────────

/**
 * Setor de ATENDIMENTO (diferente de `sectors`, que agrupa funis de venda).
 *
 * O cliente escolhe o setor no primeiro contato e a IA passa a responder com o
 * contexto daquele setor — `aiPersona` é exatamente o que entra no prompt.
 * Manter o texto no banco, e não no código, permite que o próprio cliente
 * ajuste o discurso de cada setor sem depender de deploy.
 */
export const serviceSectors = pgTable("service_sectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  /** Texto curto que aparece no menu enviado ao cliente. */
  description: text("description"),
  /** Contexto que a IA recebe para atender como este setor. */
  aiPersona: text("ai_persona"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_service_sectors_ws").on(t.workspaceId)]);

/** Quais setores cada funcionário atende. */
export const memberSectors = pgTable("member_sectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  sectorId: uuid("sector_id").notNull().references(() => serviceSectors.id),
}, (t) => [uniqueIndex("uq_member_sector").on(t.userId, t.sectorId)]);

/**
 * Pedido de atendente humano feito pelo cliente dentro de um setor.
 *
 * É uma tabela e não só um campo na conversa porque o pedido tem ciclo próprio:
 * nasce pendente, aparece para vários atendentes ao mesmo tempo e é "puxado"
 * pelo primeiro que assume. `claimedBy` com índice único parcial garante que
 * dois atendentes não atendam o mesmo cliente por acidente.
 */
export const handoffRequests = pgTable("handoff_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  conversationId: uuid("conversation_id").notNull().references(() => whatsappConversations.id),
  sectorId: uuid("sector_id").references(() => serviceSectors.id),
  contactName: text("contact_name").notNull(),
  phone: text("phone").notNull(),
  /** Resumo do que o cliente queria, para o atendente entrar por dentro. */
  summary: text("summary"),
  status: text("status", { enum: ["pendente", "atendido", "cancelado"] }).notNull().default("pendente"),
  claimedBy: uuid("claimed_by").references(() => users.id),
  claimedAt: timestamp("claimed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ix_handoff_ws_status").on(t.workspaceId, t.status),
  index("ix_handoff_sector").on(t.sectorId),
]);

// Números de WhatsApp conectados (instâncias da Evolution). Reunião com a
// Regra: só o número do GESTOR tem bot; cada consultor atende
// manualmente pelo PRÓPRIO número. `userId` null = número do gestor/geral.
export const whatsappInstances = pgTable("whatsapp_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  /** Nome da instância na Evolution (ex.: "consultor-vanessa-almeida"). */
  nome: text("nome").notNull(),
  userId: uuid("user_id").references(() => users.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uq_whatsapp_instance_nome").on(t.workspaceId, t.nome),
  index("ix_whatsapp_instance_user").on(t.userId),
]);

export const whatsappConversations = pgTable("whatsapp_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  companyId: uuid("company_id").references(() => companies.id),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id),
  presalesLeadId: uuid("presales_lead_id").references(() => presalesLeads.id),
  phone: text("phone").notNull(),
  contactName: text("contact_name").notNull(),
  assignedTo: uuid("assigned_to").references(() => users.id),
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  lastMessagePreview: text("last_message_preview"),
  unreadCount: integer("unread_count").notNull().default(0),
  status: text("status", { enum: ["open", "pending", "closed"] }).notNull().default("open"),
  // Estado do atendimento automatico: "auto" = bot responde; "human" = pausado
  // para atendimento humano (so volta a "auto" quando o cliente pedir).
  botStatus: text("bot_status", { enum: ["auto", "human"] }).notNull().default("auto"),
  /** Por qual número (instância da Evolution) o cliente falou por último — a resposta sai por ele. Null = instância padrão. */
  instancia: text("instancia"),
  /** Setor de atendimento escolhido pelo cliente no menu inicial. */
  serviceSectorId: uuid("service_sector_id").references(() => serviceSectors.id),
  /**
   * Onde a conversa está no roteiro do bot:
   *   menu            = ainda não recebeu o menu (conversa nova ou reiniciada)
   *   awaiting_sector = menu enviado, esperando a escolha
   *   sector          = setor escolhido, IA atendendo com a persona dele
   *   human           = fila/atendimento humano
   *
   * Separado de botStatus porque "esperando escolher o setor" não é nem bot
   * livre nem humano. E `awaiting_sector` existe à parte de `menu` para o bot
   * não reenviar o menu a cada mensagem: sem os dois estados, a resposta "2"
   * do cliente cairia no mesmo caminho que gerou o menu e ele voltaria.
   */
  flowState: text("flow_state", {
    enum: ["menu", "awaiting_sector", "sector", "human"],
  }).notNull().default("menu"),
  // Ultima mensagem RECEBIDA do cliente (base para o follow-up de 3 dias).
  lastInboundAt: timestamp("last_inbound_at"),
  lastFollowupAt: timestamp("last_followup_at"),
  followupCount: integer("followup_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ix_wa_conv_ws").on(t.workspaceId),
  uniqueIndex("uq_wa_conv_phone").on(t.workspaceId, t.phone),
]);

// ─── Campanhas (disparos em massa via WhatsApp) ──────────────────────────────

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  // Corpo da mensagem; suporta {{nome}} substituido pelo nome do destinatario.
  body: text("body").notNull(),
  // Imagem ou vídeo anexado, pra ir junto com a mensagem. mediaPath é o
  // caminho relativo no disco (ver lib/storage.ts); mediaType decide se o
  // disparo usa sendMedia (com anexo) ou sendText (só texto) no n8n.
  mediaPath: text("media_path"),
  mediaType: text("media_type", { enum: ["image", "video"] }),
  mediaMime: text("media_mime"),
  status: text("status", { enum: ["draft", "running", "paused", "done"] }).notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_campaigns_ws").on(t.workspaceId)]);

export const campaignRecipients = pgTable("campaign_recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  phone: text("phone").notNull(),
  name: text("name").notNull(),
  status: text("status", { enum: ["queued", "sent", "failed", "skipped"] }).notNull().default("queued"),
  error: text("error"),
  providerMessageId: text("provider_message_id"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ix_camp_rec_campaign").on(t.campaignId),
  index("ix_camp_rec_status").on(t.status),
]);

export const whatsappMessages = pgTable("whatsapp_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  conversationId: uuid("conversation_id").notNull().references(() => whatsappConversations.id),
  direction: text("direction", { enum: ["in", "out"] }).notNull(),
  body: text("body").notNull(),
  mediaType: text("media_type", { enum: ["text", "image", "document", "audio", "video"] }).notNull().default("text"),
  mediaUrl: text("media_url"),
  // Caminho relativo no disco (via salvarMidiaMensagem) para anexos ENVIADOS
  // pelo CRM — mediaUrl fica reservado para uma URL externa eventual.
  mediaPath: text("media_path"),
  mediaMime: text("media_mime"),
  sentBy: uuid("sent_by").references(() => users.id),
  sentByAgent: boolean("sent_by_agent").notNull().default(false),
  status: text("status", { enum: ["queued", "sent", "delivered", "read", "failed"] }).notNull().default("sent"),
  providerMessageId: text("provider_message_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_wa_msg_conv").on(t.conversationId)]);

export const whatsappTemplates = pgTable("whatsapp_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category", { enum: ["saudacao", "proposta", "cobranca", "instalacao", "geral"] }).notNull().default("geral"),
});

export const equipmentCatalog = pgTable("equipment_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  type: text("type", { enum: ["panel", "inverter", "battery", "structure"] }).notNull(),
  manufacturer: text("manufacturer").notNull(),
  model: text("model").notNull(),
  specs: jsonb("specs").notNull().default({}),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
});

// ─── MÓDULO VENDAS: comissões & contratos ─────────────────────────────────────

export const commissions = pgTable("commissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  baseAmount: numeric("base_amount", { precision: 12, scale: 2 }).notNull(),
  ratePct: numeric("rate_pct", { precision: 5, scale: 2 }).notNull().default("3.00"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status", { enum: ["pending", "approved", "paid", "canceled"] }).notNull().default("pending"),
  approvedAt: timestamp("approved_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_commissions_ws").on(t.workspaceId)]);

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id),
  number: text("number").notNull(),
  value: numeric("value", { precision: 12, scale: 2 }).notNull(),
  paymentTerms: text("payment_terms"),
  status: text("status", { enum: ["draft", "sent", "signed", "canceled"] }).notNull().default("draft"),
  sentAt: timestamp("sent_at"),
  signedAt: timestamp("signed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_contracts_ws").on(t.workspaceId)]);

// ─── MÓDULO FINANCEIRO (ERP) ──────────────────────────────────────────────────





export const inventoryItems = pgTable("inventory_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  equipmentId: uuid("equipment_id").references(() => equipmentCatalog.id),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(0),
  minStock: integer("min_stock").notNull().default(0),
  location: text("location"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("ix_inventory_ws").on(t.workspaceId)]);

export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  itemId: uuid("item_id").notNull().references(() => inventoryItems.id),
  kind: text("kind", { enum: ["in", "out", "adjust"] }).notNull(),
  quantity: integer("quantity").notNull(),
  reason: text("reason"),
  relatedOpportunityId: uuid("related_opportunity_id").references(() => opportunities.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  companyId: uuid("company_id").references(() => companies.id),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id),
  kind: text("kind", { enum: ["nfe", "nfse"] }).notNull().default("nfe"),
  number: text("number").notNull(),
  series: text("series").notNull().default("1"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }),
  status: text("status", { enum: ["draft", "issued", "canceled", "error"] }).notNull().default("draft"),
  accessKey: text("access_key"),
  issuedAt: timestamp("issued_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_invoices_ws").on(t.workspaceId)]);

export const payrollEntries = pgTable("payroll_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  referenceMonth: text("reference_month").notNull(), // "2026-07"
  baseSalary: numeric("base_salary", { precision: 12, scale: 2 }).notNull().default("0"),
  commissionTotal: numeric("commission_total", { precision: 12, scale: 2 }).notNull().default("0"),
  benefits: numeric("benefits", { precision: 12, scale: 2 }).notNull().default("0"),
  deductions: numeric("deductions", { precision: 12, scale: 2 }).notNull().default("0"),
  netPay: numeric("net_pay", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status", { enum: ["draft", "approved", "paid"] }).notNull().default("draft"),
  paidAt: timestamp("paid_at"),
}, (t) => [index("ix_payroll_ws").on(t.workspaceId)]);

// ─── MÓDULO ENGENHARIA ────────────────────────────────────────────────────────

export const engineeringDesigns = pgTable("engineering_designs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id),
  siteId: uuid("site_id").references(() => sites.id),
  engineerId: uuid("engineer_id").references(() => users.id),
  avgConsumptionKwh: integer("avg_consumption_kwh").notNull(),
  targetOffsetPct: integer("target_offset_pct").notNull().default(100),
  irradiationKwhM2Day: numeric("irradiation_kwh_m2_day", { precision: 4, scale: 2 }).notNull().default("4.80"),
  systemSizeKwp: numeric("system_size_kwp", { precision: 8, scale: 2 }).notNull(),
  panelModel: text("panel_model"),
  panelWatts: integer("panel_watts"),
  panelQty: integer("panel_qty"),
  inverterModel: text("inverter_model"),
  inverterKw: numeric("inverter_kw", { precision: 6, scale: 2 }),
  estimatedGenerationKwhMonth: integer("estimated_generation_kwh_month"),
  performanceRatio: numeric("performance_ratio", { precision: 4, scale: 2 }).notNull().default("0.80"),
  requiredAreaM2: numeric("required_area_m2", { precision: 8, scale: 1 }),
  unifilar: jsonb("unifilar").notNull().default({}),
  status: text("status", { enum: ["draft", "approved", "issued"] }).notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_designs_ws").on(t.workspaceId)]);

export const creditPlants = pgTable("credit_plants", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  siteId: uuid("site_id").references(() => sites.id),
  name: text("name").notNull(),
  generatingUc: text("generating_uc").notNull(), // unidade consumidora geradora
  capacityKwp: numeric("capacity_kwp", { precision: 8, scale: 2 }).notNull(),
  avgGenerationKwhMonth: integer("avg_generation_kwh_month").notNull(),
  modality: text("modality", { enum: ["self", "shared", "remote"] }).notNull().default("shared"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_creditplants_ws").on(t.workspaceId)]);

export const creditBeneficiaries = pgTable("credit_beneficiaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  plantId: uuid("plant_id").notNull().references(() => creditPlants.id),
  name: text("name").notNull(),
  uc: text("uc").notNull(), // unidade consumidora beneficiária
  sharePct: numeric("share_pct", { precision: 5, scale: 2 }).notNull(),
  avgConsumptionKwh: integer("avg_consumption_kwh").notNull().default(0),
});

// ─── MÓDULO OPERAÇÕES ─────────────────────────────────────────────────────────

export const serviceOrders = pgTable("service_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  number: text("number").notNull(),
  kind: text("kind", { enum: ["installation", "maintenance", "inspection", "repair", "survey"] }).notNull().default("installation"),
  companyId: uuid("company_id").references(() => companies.id),
  siteId: uuid("site_id").references(() => sites.id),
  installationProjectId: uuid("installation_project_id").references(() => installationProjects.id),
  technicianId: uuid("technician_id").references(() => users.id),
  priority: text("priority", { enum: ["low", "normal", "high", "urgent"] }).notNull().default("normal"),
  status: text("status", { enum: ["scheduled", "in_progress", "done", "canceled"] }).notNull().default("scheduled"),
  description: text("description"),
  checklist: jsonb("checklist").notNull().default([]),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_so_ws").on(t.workspaceId)]);

export const deliveryRoutes = pgTable("delivery_routes", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  driverId: uuid("driver_id").references(() => users.id),
  date: timestamp("date").notNull(),
  vehicle: text("vehicle"),
  status: text("status", { enum: ["planned", "in_progress", "done"] }).notNull().default("planned"),
  stops: jsonb("stops").notNull().default([]), // [{ order, address, company, items, done }]
  distanceKm: numeric("distance_km", { precision: 8, scale: 1 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_routes_ws").on(t.workspaceId)]);

// ─── MÓDULO PÓS-VENDAS ────────────────────────────────────────────────────────

export const plants = pgTable("plants", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  companyId: uuid("company_id").references(() => companies.id),
  siteId: uuid("site_id").references(() => sites.id),
  installationProjectId: uuid("installation_project_id").references(() => installationProjects.id),
  name: text("name").notNull(),
  capacityKwp: numeric("capacity_kwp", { precision: 8, scale: 2 }).notNull(),
  inverterBrand: text("inverter_brand"),
  monitoringProvider: text("monitoring_provider"),
  monitoringId: text("monitoring_id"),
  status: text("status", { enum: ["online", "offline", "warning"] }).notNull().default("online"),
  lastReadingAt: timestamp("last_reading_at"),
  todayKwh: numeric("today_kwh", { precision: 10, scale: 2 }).notNull().default("0"),
  monthKwh: numeric("month_kwh", { precision: 12, scale: 2 }).notNull().default("0"),
  totalKwh: numeric("total_kwh", { precision: 14, scale: 2 }).notNull().default("0"),
  performanceRatio: numeric("performance_ratio", { precision: 4, scale: 2 }),
  commissionedAt: timestamp("commissioned_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_plants_ws").on(t.workspaceId)]);

export const plantReadings = pgTable("plant_readings", {
  id: uuid("id").primaryKey().defaultRandom(),
  plantId: uuid("plant_id").notNull().references(() => plants.id),
  date: timestamp("date").notNull(),
  generationKwh: numeric("generation_kwh", { precision: 10, scale: 2 }).notNull(),
  expectedKwh: numeric("expected_kwh", { precision: 10, scale: 2 }),
  performanceRatio: numeric("performance_ratio", { precision: 4, scale: 2 }),
}, (t) => [index("ix_readings_plant").on(t.plantId)]);

// ─── Feedback interno ──────────────────────────────────────────────────────

export const feedbackMessages = pgTable("feedback_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  fromUserId: uuid("from_user_id").notNull().references(() => users.id),
  toUserId: uuid("to_user_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ix_feedback_ws").on(t.workspaceId),
  index("ix_feedback_to").on(t.toUserId, t.readAt),
]);

// ─── Discador: prospecção avulsa (lista de números importada) ────────────────

// O discador de /discador ja existe e funciona sobre oportunidades abertas do
// pipeline. Isso aqui e o caso diferente: uma lista crua de numeros pra
// prospeccao fria, importada de uma vez (TXT/CSV, direto na tela ou via n8n),
// que entra numa fila separada na mesma pagina. Ao atender e demonstrar
// interesse, vira presalesLead (channel "prospeccao"); do contrario so marca
// o resultado e sai da fila.
export const dialerImports = pgTable("dialer_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  totalContacts: integer("total_contacts").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_dialer_imports_ws").on(t.workspaceId)]);

export const dialerImportContacts = pgTable("dialer_import_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  importId: uuid("import_id").notNull().references(() => dialerImports.id),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  status: text("status", { enum: ["pending", "done"] }).notNull().default("pending"),
  outcome: text("outcome", { enum: ["answered", "no_answer", "voicemail", "wrong_number", "not_interested"] }),
  calledBy: uuid("called_by").references(() => users.id),
  calledAt: timestamp("called_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("ix_dialer_contacts_import").on(t.importId),
  index("ix_dialer_contacts_status").on(t.workspaceId, t.status),
]);

export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  companyId: uuid("company_id").references(() => companies.id),
  plantId: uuid("plant_id").references(() => plants.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  subject: text("subject").notNull(),
  description: text("description"),
  channel: text("channel", { enum: ["portal", "whatsapp", "phone", "email"] }).notNull().default("portal"),
  priority: text("priority", { enum: ["low", "normal", "high", "urgent"] }).notNull().default("normal"),
  status: text("status", { enum: ["open", "in_progress", "resolved", "closed"] }).notNull().default("open"),
  assignedTo: uuid("assigned_to").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("ix_tickets_ws").on(t.workspaceId)]);

// ─── Convites de acesso (Admin) ─────────────────────────────────────────────
// O Admin gera um link de uso único; quem recebe se cadastra e entra já com o
// papel do convite. Só o hash do token fica aqui (ver lib/convites.ts).
export const acessoConvites = pgTable("acesso_convites", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  tokenHash: text("token_hash").notNull(),
  papel: text("papel").notNull().default("admin"),
  criadoPor: uuid("criado_por").notNull().references(() => users.id),
  expiraEm: timestamp("expira_em").notNull(),
  usadoEm: timestamp("usado_em"),
  usadoPor: uuid("usado_por").references(() => users.id),
  revogadoEm: timestamp("revogado_em"),
  /** Convite NOMINAL: a pessoa já existe no CRM e o login nasce com o mesmo id. Nulo = convite aberto. */
  userId: uuid("user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uq_acesso_convite_token").on(t.tokenHash),
  index("ix_acesso_convite_user").on(t.userId),
  index("ix_acesso_convite_ws").on(t.workspaceId, t.createdAt),
]);

// Equipes internas (ex.: "Vendas Internas"): nome, líder e integrantes.
// Cadastradas pela gestão em Equipe e acessos; alimentam o relatório por equipe
// e a produção semanal.
export const equipes = pgTable("equipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  nome: text("nome").notNull(),
  liderId: uuid("lider_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uq_equipe_nome").on(t.workspaceId, t.nome),
]);

export const equipeMembros = pgTable("equipe_membros", {
  id: uuid("id").primaryKey().defaultRandom(),
  equipeId: uuid("equipe_id").notNull().references(() => equipes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
}, (t) => [
  uniqueIndex("uq_equipe_membro").on(t.equipeId, t.userId),
  index("ix_equipe_membro_user").on(t.userId),
]);
