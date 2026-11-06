-- Tabela de clientes (Espaço dos Clientes / aba Cadastro).
-- Compartilhada no workspace: qualquer usuário autenticado pode ler/escrever
-- (mesmo modelo de acesso das demais tabelas weflow_*, via chave anon).

create table if not exists weflow_clients (
  id           uuid primary key default gen_random_uuid(),
  name         text,
  cnpj         text,
  phone        text,
  email        text,
  contact_name text,
  address      text,
  created_by   uuid references weflow_users(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table weflow_clients enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'weflow_clients' and policyname = 'weflow_clients_all'
  ) then
    create policy weflow_clients_all on weflow_clients
      for all using (true) with check (true);
  end if;
end $$;

-- Campos de contato — adicionados aqui via IF NOT EXISTS para o caso de a
-- tabela já existir de uma criação manual anterior sem essas colunas.
alter table weflow_clients add column if not exists phone        text;
alter table weflow_clients add column if not exists email        text;
alter table weflow_clients add column if not exists contact_name text;
