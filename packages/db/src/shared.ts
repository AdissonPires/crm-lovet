import { pgSchema, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Schema `shared` — identidade e licenciamento do ecossistema Lovet.
 *
 * Lido pelo CRM; escrito somente pela superficie
 * administrativa. Nenhum modulo cria tenant, muda papel ou libera licenca por
 * conta propria: licenciamento e permissao tem uma fonte de verdade so.
 */
export const sharedSchema = pgSchema("shared");

/** Empresa cliente do SaaS. */
export const tenants = sharedSchema.table(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    taxId: text("tax_id"),
    plan: text("plan").notNull().default("trial"),
    status: text("status", { enum: ["active", "suspended", "cancelled"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tenants_slug_key").on(t.slug)],
);

/** Pessoa. Um usuario pode pertencer a mais de um tenant. */
export const users = sharedSchema.table(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    // Nulo enquanto a autenticacao real nao entra (hoje o login e por perfil).
    passwordHash: text("password_hash"),
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

/** Vinculo entre pessoa e empresa, com o papel no nivel do tenant. */
export const memberships = sharedSchema.table(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantRole: text("tenant_role", { enum: ["owner", "admin", "member"] })
      .notNull()
      .default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_tenant_user_key").on(t.tenantId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

/**
 * Papel por modulo. O design pede papeis por modulo, nao globais: quem vende no
 * CRM nao entra em outro modulo a menos que receba papel la.
 */
export const moduleRoles = sharedSchema.table(
  "module_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    module: text("module", { enum: ["crm"] }).notNull(),
    // Vocabulario proprio de cada modulo (ex.: no CRM owner/manager/rep/sdr/installer;
    // em outros modulos, o vocabulario deles).
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("module_roles_tenant_user_module_key").on(t.tenantId, t.userId, t.module),
    index("module_roles_lookup_idx").on(t.tenantId, t.module),
  ],
);

/** Qual modulo cada empresa contratou. Sem assinatura ativa, o modulo nao abre. */
export const subscriptions = sharedSchema.table(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    module: text("module", { enum: ["crm"] }).notNull(),
    status: text("status", { enum: ["active", "trial", "suspended", "cancelled"] })
      .notNull()
      .default("trial"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subscriptions_tenant_module_key").on(t.tenantId, t.module)],
);

/**
 * Sessao de login.
 *
 * O cookie guarda um TOKEN OPACO (uuid aleatorio), nunca o id do usuario
 * diretamente — se guardasse, qualquer um que editasse o cookie no navegador
 * conseguiria virar outro usuario sem senha nenhuma. Cada requisicao resolve o
 * token contra esta tabela; token que nao existe ou esta expirado nao autentica
 * ninguem.
 */
export const sessions = sharedSchema.table(
  "sessions",
  {
    // O proprio token, nao um id interno — evita um SELECT a mais so para
    // achar a linha antes de comparar o token.
    token: uuid("token").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const sharedTables = { tenants, users, memberships, moduleRoles, subscriptions, sessions };
