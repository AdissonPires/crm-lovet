-- Planilha de atividades da aba Relatórios. Compartilhada no workspace, no
-- mesmo modelo de weflow_clients (RLS aberta para a chave anon).

create table if not exists weflow_report_activities (
  id            uuid primary key default gen_random_uuid(),
  activity_name text,
  date          date,
  status        text not null default 'A fazer',
  assigned_to   uuid references weflow_users(id) on delete set null,
  client_id     uuid references weflow_clients(id) on delete set null,
  created_by    uuid references weflow_users(id) on delete set null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table weflow_report_activities enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'weflow_report_activities' and policyname = 'weflow_report_activities_all'
  ) then
    create policy weflow_report_activities_all on weflow_report_activities
      for all using (true) with check (true);
  end if;
end $$;
