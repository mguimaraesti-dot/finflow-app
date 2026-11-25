-- Papéis do FinFlow em produção. Idempotente. Rodado pelo workflow "Database" com:
--   psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -v pw="$PROD_API_DB_PASSWORD" -f scripts/prod-roles.sql
-- A senha só existe nos secrets do GitHub e nas variáveis da Vercel.

SELECT 'CREATE ROLE finflow_app NOLOGIN NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finflow_app') \gexec

SELECT format('CREATE ROLE finflow_api LOGIN NOBYPASSRLS PASSWORD %L IN ROLE finflow_app', :'pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finflow_api') \gexec

SELECT format('ALTER ROLE finflow_api WITH LOGIN NOBYPASSRLS PASSWORD %L', :'pw') \gexec

GRANT finflow_app TO finflow_api;
