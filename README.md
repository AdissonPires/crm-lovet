# Lovet Distribuidora — CRM

CRM comercial da Lovet Distribuidora: pré-vendas (SDR), pipeline de vendas, clientes e
contatos, contratos e comissões, WhatsApp (atendimento e campanhas), tarefas, relatórios de
atividade e FeedMeet (ata de reuniões com IA).

## Estrutura

| Caminho | O que é |
|---|---|
| `apps/crm` | Aplicação Next.js (App Router) — o CRM |
| `packages/db` | Schema `shared` (identidade, empresas, licenças) e utilitários de banco |
| `packages/auth` | Sessão, hash de senha e licenciamento por módulo |
| `packages/ai` | Camada de IA (Anthropic ou Ollama local) |
| `packages/ui` | Tokens visuais compartilhados |
| `n8n-evolution` | Stack Docker de WhatsApp: Evolution API, n8n, Whisper, Postgres, Redis |
| `docker/` | SQL de inicialização dos schemas e permissões do banco |

## Rodando localmente

Pré-requisitos: Node 20+, Docker, Git.

```bash
npm install
```

**1. Banco (Postgres):**

```bash
docker run -d --name lovet-postgres \
  -e POSTGRES_USER=admin -e POSTGRES_PASSWORD=<senha-admin> -e POSTGRES_DB=lovet \
  -p 127.0.0.1:5472:5432 postgres:16-alpine
```

**2. Schemas e usuário do CRM** (rode o push do `shared` antes — o SQL espera as tabelas):

```bash
cd packages/db
ADMIN_DATABASE_URL=postgresql://admin:<senha-admin>@127.0.0.1:5472/lovet npx drizzle-kit push --force
cd ../..
docker exec -i lovet-postgres psql -U admin -d lovet \
  -v crm_pw="'<senha-crm>'" -v ON_ERROR_STOP=1 \
  < docker/init-lovet-schemas.sql
```

**3. Variáveis** — crie `apps/crm/.env.local` (fora do git; veja `.env.example`):

```env
DATABASE_URL=postgresql://crm_app:<senha-crm>@127.0.0.1:5472/lovet?search_path=crm
```

**4. Tabelas, dados de demonstração e acesso:**

```bash
DATABASE_URL=... npm run db:push                  # tabelas do CRM
DATABASE_URL=... npm run db:seed                  # dados de demonstração
ADMIN_DATABASE_URL=... INITIAL_PASSWORD='<senha-forte-12+>' npm run db:bootstrap-acesso --workspace @lovet/crm
npm run dev                                       # http://localhost:3000
```

Os usuários de demonstração usam e-mails `@lovet.local`; a senha inicial é a que você
informou em `INITIAL_PASSWORD` — peça a troca no primeiro acesso ("Minha senha").

## Variáveis de ambiente

Veja `.env.example`. Nenhuma chave real deve ser versionada. Principais:

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres do CRM (schema `crm`) |
| `ANTHROPIC_API_KEY` | IA (sem ela, cai no Ollama via `OLLAMA_URL`) |
| `GROQ_API_KEY` | Transcrição do FeedMeet na nuvem (sem ela, usa `WHISPER_URL`) |
| `WHATSGW_API_KEY`, `WHATSGW_PHONE_NUMBER`, `WHATSGW_WEBHOOK_TOKEN` | WhatsApp pela WhatsGW |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | WhatsApp pela Evolution API |
| `WA_API_TOKEN` | Token das rotas `/api/wa/*` usadas pelo n8n |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Storage de áudio/mídia (sem elas, grava em disco) |
| `COOKIE_SECURE` | `true` quando há HTTPS na frente |

## Produção

`Dockerfile` na raiz gera a imagem standalone do CRM (`docker build --build-arg APP=crm .`).
Para o stack completo de WhatsApp, veja `n8n-evolution/README.md`.
