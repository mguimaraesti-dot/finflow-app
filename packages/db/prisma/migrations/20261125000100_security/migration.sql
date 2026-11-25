-- Segurança e integridade que o Prisma não expressa.
-- Papel da aplicação: finflow_app (sem BYPASSRLS). A API conecta com um login membro dele
-- e, em toda transação, define app.user_id. Ver docs/decisions/0003-rls.md.

CREATE SCHEMA IF NOT EXISTS app;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finflow_app') THEN
    CREATE ROLE finflow_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

-- ---------- Integridade ----------

ALTER TABLE transactions
  ADD CONSTRAINT transactions_amount_positive CHECK (amount_cents > 0 OR (kind = 'adjustment' AND amount_cents <> 0)),
  -- Compra no cartão pertence a uma fatura e nunca a uma conta.
  ADD CONSTRAINT transactions_target_shape CHECK (
    CASE
      WHEN credit_card_id IS NOT NULL THEN account_id IS NULL AND invoice_id IS NOT NULL AND kind IN ('expense', 'income')
      WHEN kind = 'invoice_payment' THEN account_id IS NOT NULL AND invoice_id IS NOT NULL
      ELSE account_id IS NOT NULL AND invoice_id IS NULL
    END
  ),
  ADD CONSTRAINT transactions_transfer_shape CHECK (
    (kind IN ('transfer_in', 'transfer_out')) = (transfer_group_id IS NOT NULL)
  ),
  ADD CONSTRAINT transactions_paid_shape CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  ADD CONSTRAINT transactions_installment_shape CHECK (installment_number IS NULL OR installment_number >= 1);

CREATE UNIQUE INDEX transactions_series_installment_uniq
  ON transactions (series_id, installment_number)
  WHERE series_id IS NOT NULL AND installment_number IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX transactions_series_date_uniq
  ON transactions (series_id, competence_date)
  WHERE series_id IS NOT NULL AND installment_number IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX transactions_external_uniq
  ON transactions (workspace_id, source, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE credit_cards
  ADD CONSTRAINT credit_cards_days CHECK (closing_day BETWEEN 1 AND 31 AND due_day BETWEEN 1 AND 31),
  ADD CONSTRAINT credit_cards_limit CHECK (limit_cents >= 0);

ALTER TABLE transfer_groups ADD CONSTRAINT transfer_groups_amount CHECK (amount_cents > 0);

ALTER TABLE invoices ADD CONSTRAINT invoices_dates CHECK (due_date >= closing_date);

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_currency CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE users ADD CONSTRAINT users_email_lower CHECK (email = lower(email));
ALTER TABLE invites ADD CONSTRAINT invites_email_lower CHECK (email = lower(email));

CREATE UNIQUE INDEX invites_pending_uniq
  ON invites (workspace_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Um único espaço Pessoal por pessoa.
CREATE UNIQUE INDEX workspaces_one_personal_per_user
  ON workspaces (created_by)
  WHERE type = 'personal';

CREATE UNIQUE INDEX categories_unique_name
  ON categories (workspace_id, kind, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  WHERE archived_at IS NULL;

-- ---------- Contexto da requisição ----------

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app.member_role(p_workspace uuid) RETURNS member_role
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT role FROM memberships
  WHERE workspace_id = p_workspace AND user_id = app.current_user_id()
$$;

CREATE OR REPLACE FUNCTION app.is_member(p_workspace uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT app.member_role(p_workspace) IS NOT NULL $$;

CREATE OR REPLACE FUNCTION app.can_write(p_workspace uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT coalesce(app.member_role(p_workspace) IN ('owner', 'editor'), false) $$;

-- Cria um espaço e já torna quem criou dono dele (evita o ovo e a galinha do RLS).
CREATE OR REPLACE FUNCTION app.create_workspace(p_name text, p_type workspace_type) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'sem usuário no contexto' USING ERRCODE = '42501';
  END IF;
  IF length(trim(p_name)) = 0 OR length(p_name) > 60 THEN
    RAISE EXCEPTION 'nome de espaço inválido' USING ERRCODE = '22023';
  END IF;
  INSERT INTO workspaces (name, type, created_by) VALUES (trim(p_name), p_type, v_user) RETURNING id INTO v_id;
  INSERT INTO memberships (workspace_id, user_id, role) VALUES (v_id, v_user, 'owner');
  RETURN v_id;
END
$$;

-- Aceita um convite pendente cujo e-mail é o do usuário logado.
CREATE OR REPLACE FUNCTION app.accept_invite(p_token_hash text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_email text;
  v_invite invites%ROWTYPE;
  v_members int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'sem usuário no contexto' USING ERRCODE = '42501';
  END IF;
  SELECT email INTO v_email FROM users WHERE id = v_user;

  SELECT * INTO v_invite FROM invites WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_invite.revoked_at IS NOT NULL OR v_invite.accepted_at IS NOT NULL OR v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'convite inválido ou expirado' USING ERRCODE = 'P0002';
  END IF;
  IF v_invite.email <> v_email THEN
    RAISE EXCEPTION 'convite enviado para outro e-mail' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM memberships WHERE workspace_id = v_invite.workspace_id AND user_id = v_user) THEN
    UPDATE invites SET accepted_at = now(), accepted_by = v_user WHERE id = v_invite.id;
    RETURN v_invite.workspace_id;
  END IF;

  SELECT count(*) INTO v_members FROM memberships WHERE workspace_id = v_invite.workspace_id;
  IF v_members >= 2 THEN
    RAISE EXCEPTION 'o espaço já tem duas pessoas' USING ERRCODE = '23514';
  END IF;

  INSERT INTO memberships (workspace_id, user_id, role) VALUES (v_invite.workspace_id, v_user, v_invite.role);
  UPDATE invites SET accepted_at = now(), accepted_by = v_user WHERE id = v_invite.id;
  RETURN v_invite.workspace_id;
END
$$;

-- ---------- Saldos derivados (nunca armazenados) ----------

CREATE VIEW account_balances WITH (security_invoker = true) AS
SELECT
  a.id AS account_id,
  a.workspace_id,
  a.initial_balance_cents + coalesce(sum(
    CASE
      WHEN t.kind IN ('income', 'transfer_in', 'adjustment') THEN t.amount_cents
      WHEN t.kind IN ('expense', 'transfer_out', 'invoice_payment') THEN -t.amount_cents
      ELSE 0
    END
  ) FILTER (WHERE t.status = 'paid'), 0) AS current_balance_cents,
  a.initial_balance_cents + coalesce(sum(
    CASE
      WHEN t.kind IN ('income', 'transfer_in', 'adjustment') THEN t.amount_cents
      WHEN t.kind IN ('expense', 'transfer_out', 'invoice_payment') THEN -t.amount_cents
      ELSE 0
    END
  ) FILTER (WHERE t.status IN ('paid', 'pending')), 0) AS projected_balance_cents
FROM accounts a
LEFT JOIN transactions t
  ON t.account_id = a.id AND t.workspace_id = a.workspace_id
  AND t.deleted_at IS NULL AND NOT t.ignored
GROUP BY a.id;

CREATE VIEW invoice_balances WITH (security_invoker = true) AS
SELECT
  i.id AS invoice_id,
  i.workspace_id,
  i.credit_card_id,
  coalesce(sum(CASE WHEN t.credit_card_id IS NOT NULL AND t.kind = 'expense' THEN t.amount_cents
                    WHEN t.credit_card_id IS NOT NULL AND t.kind = 'income' THEN -t.amount_cents
                    ELSE 0 END), 0) AS total_cents,
  coalesce(sum(CASE WHEN t.kind = 'invoice_payment' AND t.status = 'paid' THEN t.amount_cents ELSE 0 END), 0) AS paid_cents
FROM invoices i
LEFT JOIN transactions t
  ON t.invoice_id = i.id AND t.workspace_id = i.workspace_id
  AND t.deleted_at IS NULL AND NOT t.ignored
GROUP BY i.id;

-- ---------- Permissões ----------

GRANT USAGE ON SCHEMA public, app TO finflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finflow_app;
REVOKE UPDATE, DELETE ON audit_logs FROM finflow_app;
REVOKE INSERT, UPDATE, DELETE ON institutions FROM finflow_app;
REVOKE INSERT, DELETE ON workspaces FROM finflow_app;
REVOKE INSERT, UPDATE ON memberships FROM finflow_app;
GRANT SELECT ON account_balances, invoice_balances TO finflow_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO finflow_app;
REVOKE ALL ON _prisma_migrations FROM finflow_app;

-- ---------- Row-Level Security ----------

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspaces_select ON workspaces FOR SELECT TO finflow_app USING (app.is_member(id));
CREATE POLICY workspaces_update ON workspaces FOR UPDATE TO finflow_app
  USING (app.member_role(id) = 'owner') WITH CHECK (app.member_role(id) = 'owner');

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY memberships_select ON memberships FOR SELECT TO finflow_app USING (app.is_member(workspace_id));
-- Dono remove outra pessoa; qualquer um pode sair de um espaço compartilhado.
CREATE POLICY memberships_delete ON memberships FOR DELETE TO finflow_app USING (
  role <> 'owner' AND (app.member_role(workspace_id) = 'owner' OR user_id = app.current_user_id())
);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY invites_select ON invites FOR SELECT TO finflow_app USING (app.member_role(workspace_id) = 'owner');
CREATE POLICY invites_insert ON invites FOR INSERT TO finflow_app WITH CHECK (
  app.member_role(workspace_id) = 'owner'
  AND invited_by = app.current_user_id()
  AND role <> 'owner'
  AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.type = 'shared')
);
CREATE POLICY invites_update ON invites FOR UPDATE TO finflow_app
  USING (app.member_role(workspace_id) = 'owner') WITH CHECK (app.member_role(workspace_id) = 'owner');

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts', 'categories', 'credit_cards', 'invoices', 'transaction_series', 'transfer_groups', 'transactions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO finflow_app USING (app.is_member(workspace_id))', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO finflow_app WITH CHECK (app.can_write(workspace_id))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO finflow_app USING (app.can_write(workspace_id)) WITH CHECK (app.can_write(workspace_id))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO finflow_app USING (app.can_write(workspace_id))', t || '_delete', t);
  END LOOP;
END
$$;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO finflow_app USING (
  (workspace_id IS NOT NULL AND app.is_member(workspace_id))
  OR (workspace_id IS NULL AND actor_id = app.current_user_id())
);
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO finflow_app WITH CHECK (
  (actor_id IS NULL OR actor_id = app.current_user_id())
  AND (workspace_id IS NULL OR app.is_member(workspace_id))
);

-- Tabelas futuras herdam as permissões do papel da aplicação; RLS de cada uma é obrigatório
-- (o teste de isolamento falha se uma tabela com workspace_id ficar sem RLS).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO finflow_app;

-- Prévia de um convite para quem ainda não é membro (nome do espaço e de quem convidou).
CREATE OR REPLACE FUNCTION app.invite_preview(p_token_hash text)
  RETURNS TABLE (workspace_name text, invited_by_name text, email text, status text, expires_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT w.name, u.name, i.email,
         CASE
           WHEN i.revoked_at IS NOT NULL THEN 'revoked'
           WHEN i.accepted_at IS NOT NULL THEN 'accepted'
           WHEN i.expires_at < now() THEN 'expired'
           ELSE 'pending'
         END,
         i.expires_at
  FROM invites i
  JOIN workspaces w ON w.id = i.workspace_id
  JOIN users u ON u.id = i.invited_by
  WHERE i.token_hash = p_token_hash AND app.current_user_id() IS NOT NULL
$$;
GRANT EXECUTE ON FUNCTION app.invite_preview(text) TO finflow_app;
