#!/usr/bin/env bash
# Cria o banco e os papéis locais. Rode uma vez, como superusuário do Postgres.
# Em produção os papéis são criados pelo provedor; veja docs/decisions/0003-rls.md.
set -euo pipefail

SUPERUSER_URL="${SUPERUSER_URL:-postgresql://postgres:postgres@localhost:5432/postgres}"
DB_NAME="${DB_NAME:-finflow}"

psql "$SUPERUSER_URL" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finflow_owner') THEN
    CREATE ROLE finflow_owner LOGIN PASSWORD 'finflow_owner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finflow_app') THEN
    CREATE ROLE finflow_app NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finflow_api') THEN
    CREATE ROLE finflow_api LOGIN PASSWORD 'finflow_api' NOBYPASSRLS IN ROLE finflow_app;
  END IF;
END
\$\$;
SQL

for db in "$DB_NAME" "${DB_NAME}_test"; do
  if ! psql "$SUPERUSER_URL" -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1; then
    psql "$SUPERUSER_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$db\" OWNER finflow_owner"
  fi
done

echo "Bancos $DB_NAME e ${DB_NAME}_test prontos."
