# WeFlow — gestor de tarefas da Lovet Distribuidora

Kanban, calendário, notas, checklist, clientes, relatórios e equipe. Abre pelo botão **WeFlow**
do CRM, já logado (SSO). Frontend Vite + React (`src/`), API Express (`api/`) e banco Supabase
(`supabase/migrations`) ou, em desenvolvimento, um banco local em `data/db.json`.

## Rodando localmente

```bash
cd weflow
npm install
cp .env.example .env     # preencha JWT_SECRET e SSO_SHARED_SECRET
WEB_PORT=5174 API_PORT=3101 npm run dev
```

- Tela: http://localhost:5174 · API: http://localhost:3101/api/health
- Testes: `npm test`

## Entrada pelo CRM (SSO)

1. Defina o mesmo `SSO_SHARED_SECRET` (24+ caracteres) aqui (`weflow/.env`) e no CRM (`apps/crm/.env.local`),
   junto com `WEFLOW_PUBLIC_URL=http://localhost:5174` no CRM.
2. No CRM, clique em **WeFlow** no menu lateral. O CRM gera um token de 60 s e uso único; o WeFlow cria ou
   atualiza o usuário pelo e-mail. Donos, admins e gestores do CRM entram como **gestor**; os demais, como **funcionário**.

## Observações

- Sem `SUPABASE_URL`, os dados ficam em `data/db.json` (não versionado). Para produção, use Supabase e
  siga a ordem de migrações em `supabase/migrations`.
- O módulo "Assistente (ChatGPT)" vem desligado; só liga com `ASSISTANT_*` (ver código em `api/_lib/assistant.js`).
- Nenhuma senha padrão: a conta de gestor local só tem senha se você definir `WEFLOW_GESTOR_PASSWORD`.
