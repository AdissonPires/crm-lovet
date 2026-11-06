-- Colunas do Kanban persistidas no banco. Enquanto esta tabela não existe, o
-- frontend usa localStorage como fallback (colunas por usuário, no navegador).

create table if not exists weflow_columns (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  label      text not null,
  position   integer not null default 0,
  color      text not null default '#14b8c4',
  created_at timestamptz default now()
);

insert into weflow_columns (key, label, position, color) values
  ('todo',  'A Fazer',      0, '#9ca3af'),
  ('doing', 'Em Progresso', 1, '#14b8c4'),
  ('done',  'Concluído',    2, '#2ec27e')
on conflict (key) do nothing;

-- Alguns projetos Supabase forçam RLS automaticamente em toda tabela nova; sem
-- política, a tabela fica inacessível via API mesmo para o backend.
alter table weflow_columns enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'weflow_columns' and policyname = 'weflow_columns_all'
  ) then
    create policy weflow_columns_all on weflow_columns
      for all using (true) with check (true);
  end if;
end $$;
