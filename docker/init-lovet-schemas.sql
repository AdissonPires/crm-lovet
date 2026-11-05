-- CRM Lovet Distribuidora — schemas e permissoes do banco.
--
-- As senhas vem por variavel, nao ficam no arquivo:
--
--   docker exec -i postgres psql -U admin -d lovet \
--     -v crm_pw="'senha-do-crm'" \
--     -v ON_ERROR_STOP=1 < docker/init-lovet-schemas.sql
--
-- (as aspas simples internas sao necessarias: psql interpola literalmente)

\if :{?crm_pw}
\else
  \echo 'ERRO: passe -v crm_pw="''senha''"'
  \quit
\endif

-- ── Schemas ────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS shared;
CREATE SCHEMA IF NOT EXISTS crm;

-- ── Usuarios por modulo ────────────────────────────────────────────────────
SELECT format('CREATE ROLE crm_app LOGIN PASSWORD %L', :crm_pw)
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_app')
\gexec

GRANT CONNECT ON DATABASE lovet TO crm_app;

-- Ninguem cria objeto solto no public
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- ── CRM: dono do schema crm e leitor de shared ─────────────────────────────
GRANT USAGE, CREATE ON SCHEMA crm TO crm_app;
GRANT USAGE ON SCHEMA shared TO crm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA crm
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA shared
  GRANT SELECT ON TABLES TO crm_app;
-- As tabelas do shared ja existem (push do shared roda antes): o default acima
-- so vale para tabelas futuras, entao concede leitura nas atuais tambem.
GRANT SELECT ON ALL TABLES IN SCHEMA shared TO crm_app;

-- ── Sessao de login: excecao pontual ao "shared e so leitura" ──────────────
-- Autenticar e a unica escrita que os modulos fazem em shared — criar sessao
-- no login, apagar no logout. Ainda assim nenhum modulo grava em tenants ou
-- subscriptions: essas continuam exclusivas da superficie administrativa.
GRANT SELECT, INSERT, DELETE ON shared.sessions TO crm_app;

-- ── Gestao de usuario: segunda excecao pontual ──────────────────────────────
-- Sem uma superficie administrativa separada ainda, convidar usuario, mudar
-- papel de modulo e resetar senha precisam acontecer de algum lugar — por ora,
-- de dentro dos proprios modulos, pela tela de gestao de usuarios. O que
-- continua fechado: tenants e subscriptions (quem contrata o que) so a
-- superficie administrativa muda.
GRANT SELECT, INSERT, UPDATE ON shared.users TO crm_app;
GRANT SELECT, INSERT ON shared.memberships TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON shared.module_roles TO crm_app;

