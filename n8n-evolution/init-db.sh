#!/bin/bash
set -e

# Cria os bancos do stack dentro do mesmo Postgres:
#   n8n        — automacao de workflows
#   evolution  — Evolution API (WhatsApp)
#   lovet      — CRM Lovet (schemas shared e crm)
#
# Roda apenas na primeira inicializacao, com o diretorio de dados vazio.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE n8n'       WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n')\gexec
    SELECT 'CREATE DATABASE evolution' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution')\gexec
    SELECT 'CREATE DATABASE lovet'     WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'lovet')\gexec
EOSQL

echo "Bancos 'n8n', 'evolution' e 'lovet' prontos."
echo "Schemas e usuarios do lovet: rode docker/init-lovet-schemas.sql (precisa das senhas por variavel)."
