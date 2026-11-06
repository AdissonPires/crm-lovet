-- Arquitetura multi-tenant do weFlow.
--
-- Conceitos (não confundir):
--   weflow_workspaces  → as empresas CLIENTES do weFlow (ex.: WeFlow).
--   weflow_clients   → os clientes COMERCIAIS de cada uma dessas empresas.
--
-- Migration incremental: nenhuma migration anterior é alterada e nenhum dado
-- é apagado. Todos os registros existentes são adotados pelo workspace inicial
-- (WeFlow), criado aqui a partir do gestor mais antigo.

-- ── Workspaces (empresas clientes do weFlow) ────────────────────────────────
create table if not exists weflow_workspaces (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  cnpj         text,
  phone        text,
  email        text,
  contact_name text,
  address      text,
  color        text,
  created_by   uuid references weflow_users(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table weflow_workspaces enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'weflow_workspaces' and policyname = 'weflow_workspaces_all'
  ) then
    create policy weflow_workspaces_all on weflow_workspaces
      for all using (true) with check (true);
  end if;
end $$;

-- ── workspace_id nas entidades que pertencem a uma empresa ──────────────────
alter table weflow_users              add column if not exists workspace_id uuid references weflow_workspaces(id) on delete cascade;
alter table weflow_tasks              add column if not exists workspace_id uuid references weflow_workspaces(id) on delete cascade;
alter table weflow_notes              add column if not exists workspace_id uuid references weflow_workspaces(id) on delete cascade;
alter table weflow_todos              add column if not exists workspace_id uuid references weflow_workspaces(id) on delete cascade;
alter table weflow_media              add column if not exists workspace_id uuid references weflow_workspaces(id) on delete cascade;
alter table weflow_folders            add column if not exists workspace_id uuid references weflow_workspaces(id) on delete cascade;
alter table weflow_folder_media       add column if not exists workspace_id uuid references weflow_workspaces(id) on delete cascade;
alter table weflow_columns            add column if not exists workspace_id uuid references weflow_workspaces(id) on delete cascade;
alter table weflow_clients            add column if not exists workspace_id uuid references weflow_workspaces(id) on delete cascade;
alter table weflow_report_activities  add column if not exists workspace_id uuid references weflow_workspaces(id) on delete cascade;
alter table weflow_tags               add column if not exists workspace_id uuid references weflow_workspaces(id) on delete cascade;

-- Conta ativa/inativa: usuário inativo não autentica.
alter table weflow_users add column if not exists status text not null default 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'weflow_users_status_check'
  ) then
    alter table weflow_users
      add constraint weflow_users_status_check check (status in ('active', 'inactive'));
  end if;
end $$;

-- ── Adoção dos dados existentes pelo workspace inicial ──────────────────────
do $$
declare
  ws_id uuid;
begin
  select id into ws_id from weflow_workspaces order by created_at limit 1;

  if ws_id is null then
    insert into weflow_workspaces (name, color, created_by)
    values (
      'WeFlow',
      '#14b8c4',
      (select id from weflow_users where role = 'gestor' order by created_at limit 1)
    )
    returning id into ws_id;
  end if;

  update weflow_users             set workspace_id = ws_id where workspace_id is null;
  update weflow_tasks             set workspace_id = ws_id where workspace_id is null;
  update weflow_notes             set workspace_id = ws_id where workspace_id is null;
  update weflow_todos             set workspace_id = ws_id where workspace_id is null;
  update weflow_media             set workspace_id = ws_id where workspace_id is null;
  update weflow_folders           set workspace_id = ws_id where workspace_id is null;
  update weflow_folder_media      set workspace_id = ws_id where workspace_id is null;
  update weflow_columns           set workspace_id = ws_id where workspace_id is null;
  update weflow_clients           set workspace_id = ws_id where workspace_id is null;
  update weflow_report_activities set workspace_id = ws_id where workspace_id is null;
  update weflow_tags              set workspace_id = ws_id where workspace_id is null;
end $$;

-- ── Convites de funcionários ────────────────────────────────────────────────
-- O gestor cria o convite; a senha é definida por quem foi convidado.
-- O banco guarda apenas o HASH do token — o token puro só trafega no link.
create table if not exists weflow_invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references weflow_workspaces(id) on delete cascade,
  email        text not null,
  name         text not null,
  role         text not null default 'funcionario',
  job_title    text,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  created_by   uuid references weflow_users(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  constraint weflow_invitations_role_check check (role in ('gestor', 'funcionario'))
);

alter table weflow_invitations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'weflow_invitations' and policyname = 'weflow_invitations_all'
  ) then
    create policy weflow_invitations_all on weflow_invitations
      for all using (true) with check (true);
  end if;
end $$;

-- ── Unicidade que passa a ser por workspace ─────────────────────────────────
-- Chave de coluna do Kanban e nome de etiqueta eram únicos em todo o banco;
-- com vários workspaces isso impediria duas empresas de terem a mesma coluna.
-- O e-mail do usuário continua único globalmente: é o identificador de login.
-- A constraint UNIQUE cria o índice implicitamente; dropar o índice primeiro
-- falha com "requires it" porque a constraint ainda depende dele. Basta
-- dropar a constraint — o índice antigo some junto.
alter table weflow_columns drop constraint if exists weflow_columns_key_key;
create unique index if not exists weflow_columns_workspace_key_idx
  on weflow_columns (workspace_id, key);

alter table weflow_tags drop constraint if exists weflow_tags_name_key;
create unique index if not exists weflow_tags_workspace_name_idx
  on weflow_tags (workspace_id, name);

-- ── Índices de isolamento (toda consulta filtra por workspace_id) ───────────
create index if not exists weflow_users_workspace_idx              on weflow_users (workspace_id);
create index if not exists weflow_tasks_workspace_idx              on weflow_tasks (workspace_id);
create index if not exists weflow_notes_workspace_idx              on weflow_notes (workspace_id);
create index if not exists weflow_todos_workspace_idx              on weflow_todos (workspace_id);
create index if not exists weflow_media_workspace_idx              on weflow_media (workspace_id);
create index if not exists weflow_folders_workspace_idx            on weflow_folders (workspace_id);
create index if not exists weflow_folder_media_workspace_idx       on weflow_folder_media (workspace_id);
create index if not exists weflow_columns_workspace_idx            on weflow_columns (workspace_id);
create index if not exists weflow_clients_workspace_idx            on weflow_clients (workspace_id);
create index if not exists weflow_report_activities_workspace_idx  on weflow_report_activities (workspace_id);
create index if not exists weflow_tags_workspace_idx               on weflow_tags (workspace_id);
create index if not exists weflow_invitations_workspace_email_idx    on weflow_invitations (workspace_id, email);
