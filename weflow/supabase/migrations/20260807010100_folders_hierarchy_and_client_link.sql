-- Hierarquia de pastas (pastas dentro de pastas) e vínculo com clientes
-- (aba Documentações agrupada por cliente). client_id é nullable — pastas
-- legadas ou sem cliente atribuído caem no grupo "Sem cliente" no frontend.

alter table weflow_folders
  add column if not exists parent_id uuid
  references weflow_folders(id) on delete cascade;

alter table weflow_folders
  add column if not exists client_id uuid
  references weflow_clients(id) on delete set null;
