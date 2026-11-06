# Lovet Distribuidora — CRM

Guia rápido para agentes e desenvolvedores. Detalhes de instalação estão no `README.md`.

## Stack

- Monorepo npm workspaces: `apps/crm` (Next.js, App Router, React 19), `packages/{db,auth,ai,ui}`.
- Banco: Postgres via Drizzle ORM. Schema `crm` (tabelas do app, em `apps/crm/src/db/schema.ts`) e
  schema `shared` (identidade e licenças, em `packages/db/src/shared.ts`).
- Autenticação: sessão própria em `packages/auth`; papéis por módulo em `shared.module_roles`;
  permissões do CRM em `apps/crm/src/lib/policy.ts`.
- IA: `packages/ai` (Anthropic quando `ANTHROPIC_API_KEY` existe; senão Ollama).
- WhatsApp: WhatsGW ou Evolution API + n8n (`n8n-evolution/`).
- WeFlow (`weflow/`): gestor de tarefas separado (Vite+React, Express, Supabase ou banco local). O CRM abre ele por `/api/sso/weflow` (token HS256 de 60 s com `SSO_SHARED_SECRET`). Fora dos workspaces npm, de propósito: usa React 18.

## Convenções

- Texto de interface e comentários em português do Brasil.
- Segredos só por variável de ambiente; nunca em código, seed ou documentação.
- Catálogo de produtos e tabela de preços: `apps/crm/src/lib/produtos.ts` (edite para o catálogo real).
- Tokens de cor `brand-*` em `apps/crm/src/app/globals.css`: verde #009949 e grafite #363533, extraídos do logo da Lovet.

## Comandos

```bash
npm run dev          # CRM em http://localhost:3000
npm run build        # build de produção
npm run lint
npm run db:push      # aplica o schema crm
npm run db:seed      # dados de demonstração
```

## Pendências conhecidas

- Textos e preços do catálogo em `produtos.ts` são marcadores ("Produto A") até o cadastro real.
