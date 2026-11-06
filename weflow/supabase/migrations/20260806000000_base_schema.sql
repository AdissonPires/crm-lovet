-- Schema-base do weFlow. As migrations seguintes deste diretório só fazem
-- ALTER TABLE sobre estas tabelas — elas foram criadas originalmente pelo
-- editor do dashboard Supabase e nunca tinham sido capturadas como migration.
-- Reconstruída aqui a partir do uso real em api/index.js e do shim local
-- (api/localDb.js), para que um projeto Supabase novo suba do zero.

create extension if not exists "pgcrypto";

-- ---------- Usuários ----------
create table if not exists weflow_users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  password_hash text not null,
  role          text not null default 'funcionario',
  created_at    timestamptz default now()
);

alter table weflow_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'weflow_users' and policyname = 'weflow_users_all'
  ) then
    create policy weflow_users_all on weflow_users
      for all using (true) with check (true);
  end if;
end $$;

-- ---------- Tarefas ----------
create table if not exists weflow_tasks (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  description          text default '',
  priority             text not null default 'Média',
  due_date             date,
  column_key           text not null default 'todo',
  user_id              uuid references weflow_users(id) on delete set null,
  assigned_to          uuid references weflow_users(id) on delete set null,
  logged_time_seconds  integer not null default 0,
  attachments          jsonb not null default '[]'::jsonb,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

alter table weflow_tasks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'weflow_tasks' and policyname = 'weflow_tasks_all'
  ) then
    create policy weflow_tasks_all on weflow_tasks
      for all using (true) with check (true);
  end if;
end $$;

-- ---------- Notas ----------
create table if not exists weflow_notes (
  id         uuid primary key default gen_random_uuid(),
  title      text default 'Nova nota',
  content    text default '',
  user_id    uuid references weflow_users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table weflow_notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'weflow_notes' and policyname = 'weflow_notes_all'
  ) then
    create policy weflow_notes_all on weflow_notes
      for all using (true) with check (true);
  end if;
end $$;

-- ---------- Checklist pessoal ----------
create table if not exists weflow_todos (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  priority   text not null default 'Média',
  due_at     timestamptz,
  done       boolean not null default false,
  user_id    uuid references weflow_users(id) on delete cascade,
  created_at timestamptz default now()
);

alter table weflow_todos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'weflow_todos' and policyname = 'weflow_todos_all'
  ) then
    create policy weflow_todos_all on weflow_todos
      for all using (true) with check (true);
  end if;
end $$;

-- ---------- Mídia de perfil (imagem/vídeo de capa, 1 linha por tipo/usuário) ----------
create table if not exists weflow_media (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  data_url   text default '',
  user_id    uuid references weflow_users(id) on delete cascade,
  updated_at timestamptz default now(),
  unique (user_id, kind)
);

alter table weflow_media enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'weflow_media' and policyname = 'weflow_media_all'
  ) then
    create policy weflow_media_all on weflow_media
      for all using (true) with check (true);
  end if;
end $$;

-- ---------- Pastas de documentos ----------
create table if not exists weflow_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text default '#14b8c4',
  created_by uuid references weflow_users(id) on delete set null,
  created_at timestamptz default now()
);

alter table weflow_folders enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'weflow_folders' and policyname = 'weflow_folders_all'
  ) then
    create policy weflow_folders_all on weflow_folders
      for all using (true) with check (true);
  end if;
end $$;

-- ---------- Documentos dentro de uma pasta ----------
create table if not exists weflow_folder_media (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null references weflow_folders(id) on delete cascade,
  kind        text not null,
  url         text not null,
  name        text default '',
  uploaded_by uuid references weflow_users(id) on delete set null,
  created_at  timestamptz default now()
);

alter table weflow_folder_media enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'weflow_folder_media' and policyname = 'weflow_folder_media_all'
  ) then
    create policy weflow_folder_media_all on weflow_folder_media
      for all using (true) with check (true);
  end if;
end $$;
