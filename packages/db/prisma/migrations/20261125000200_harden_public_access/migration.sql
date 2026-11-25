-- Fecha o banco para qualquer papel que não seja a aplicação.
-- No Supabase, os papéis anon/authenticated recebem acesso ao schema public por padrão e ficam
-- expostos pela Data API (PostgREST) com a chave pública do projeto. O FinFlow não usa essa API:
-- tudo passa pela nossa API com o papel finflow_app.

-- RLS em todas as tabelas, inclusive identidade (users, sessions...). Para finflow_app essas
-- tabelas continuam acessíveis por uma política explícita; qualquer outro papel não vê nada.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'sessions', 'password_resets', 'consents', 'idempotency_keys', 'institutions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO finflow_app USING (true) WITH CHECK (true)', t || '_app_all', t);
  END LOOP;
END
$$;

ALTER TABLE _prisma_migrations ENABLE ROW LEVEL SECURITY;

-- Remove o acesso dos papéis da Data API do Supabase, se existirem.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON SCHEMA app FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END
$$;

-- Funções do schema app não ficam executáveis por PUBLIC (padrão do Postgres).
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO finflow_app;
