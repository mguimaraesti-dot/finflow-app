# FinFlow — Gestão Financeira

Gerenciador financeiro pessoal para uma pessoa sozinha ou para um casal. Cada pessoa tem um
espaço **Pessoal**, só dela, e pode criar um espaço **Casal** e convidar a outra pessoa.

> Status: Fase 3 (fundação técnica) — autenticação, espaços, convites, auditoria, isolamento
> por Row-Level Security e o motor de faturas. Lançamentos, cartões e faturas na tela chegam
> na Fase 4 (MVP).

## Estrutura

```
apps/
  api/        NestJS (REST) — única porta de escrita no banco
  web/        Next.js (App Router) — fala com a API pelo servidor; tokens em cookie httpOnly
packages/
  shared/     regras puras compartilhadas: dinheiro em centavos, datas, ciclo de fatura, schemas Zod
  db/         Prisma (schema + migrations com RLS, views e funções)
docs/decisions/   decisões de arquitetura (ADRs)
```

## Rodando localmente

Pré-requisitos: Node 22, pnpm 10, Postgres 16 (ou `docker compose up -d`).

```bash
pnpm install
cp .env.example .env                    # preencha JWT_ACCESS_SECRET (openssl rand -base64 48)
cp .env packages/db/.env
pnpm db:setup                           # cria papéis finflow_owner / finflow_app / finflow_api e os bancos
pnpm db:migrate                         # aplica migrations no banco de desenvolvimento
DATABASE_URL=postgresql://finflow_owner:finflow_owner@localhost:5432/finflow_test pnpm db:migrate
pnpm build
pnpm test                               # unitários + integração contra o banco finflow_test

# em dois terminais
set -a; . ./.env; set +a; node apps/api/dist/main.js
pnpm --filter @finflow/web dev
```

Abra http://localhost:3000.

## Banco: dois papéis

- `DATABASE_URL` (dono do schema) — só para migrations.
- `DATABASE_URL_APP` (papel sem `BYPASSRLS`) — o que a API usa. Toda consulta roda numa
  transação com `app.user_id` definido, e as políticas de RLS só mostram dados de espaços dos
  quais a pessoa é membro. Ver [ADR 0003](docs/decisions/0003-rls.md).

## Testes que protegem o produto

- `packages/shared`: ciclo de fatura (fechamento, dia 31, virada de ano, parcelas) e arredondamento.
- `apps/api/test/isolation.test.ts`: ninguém lê nem grava no espaço de outra pessoa, nem pela API
  nem direto no banco; toda tabela com `workspace_id` precisa ter RLS ligado.
- `apps/api/test/auth.test.ts`: cadastro, login, rotação de refresh token com detecção de reuso,
  recuperação de senha.
