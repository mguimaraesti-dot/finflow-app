-- Fixa o search_path da função de contexto (aviso do linter de segurança do Supabase).
ALTER FUNCTION app.current_user_id() SET search_path = pg_catalog, pg_temp;
