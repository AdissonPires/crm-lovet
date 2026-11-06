-- Anexos de arquivos nas notas. Segue o mesmo padrão já usado para
-- `weflow_tasks.attachments`: array simples na própria linha em vez de uma
-- tabela relacional, evitando join (o shim local de dev não parseia joins).
-- Cada item do array: { id, file_name, file_url, file_size, file_type, created_at }.
alter table weflow_notes add column if not exists attachments jsonb not null default '[]'::jsonb;
