# Handover — FinFlow · Gestão Financeira

Situação em 28/11/2026. Ponto de partida para quem assume o projeto (pessoa ou agente).
Leia antes o [CLAUDE.md](../CLAUDE.md) (regras que não mudam sem conversar com o dono) e os
[ADRs](decisions/).

## 1. O produto em uma frase

Gestão financeira pessoal inspirada na UX do Mobills (sem copiar marca, código ou textos).
Toda pessoa tem um espaço **Pessoal**; pode criar um espaço **Casal** (2 membros) por convite.
Uso diário previsto no celular; a Web veio primeiro.

## 2. Onde está cada coisa

| Item | Onde |
|---|---|
| Código | GitHub `mguimaraesti-dot/finflow-app`, branch `main` (push direto, decisão do dono) |
| Repositório antigo | `mguimaraesti-dot/finflow` — outro projeto, em produção, **não mexer** |
| Web (produção) | https://finflow-app-vh9p.vercel.app — projeto Vercel `finflow-web`, root `apps/web` |
| API (produção) | https://finflow-app-ruddy.vercel.app — projeto Vercel `finflow-api`, root `apps/api` (`/health`) |
| Vercel | time `team_72JJSOPecpF7U9t8xS5GR8XU`; deploy automático a cada push na `main`; região `gru1` |
| Banco | Supabase, projeto `ujhlhbwqqwhthsexypto` (Postgres). Só o banco é usado; a Data API não |
| Design | Artefatos "FinFlow — Design System" e "FinFlow — Protótipos mobile" no Claude |

**Segredos (nomes, nunca valores):**
- GitHub Actions: `PROD_DATABASE_URL` (session pooler, porta 5432) e `PROD_API_DB_PASSWORD`.
- Vercel `finflow-api`: `DATABASE_URL_APP`, `JWT_ACCESS_SECRET`, `WEB_URL`, `API_CORS_ORIGIN`.
- Vercel `finflow-web`: `API_URL`.
- `SUPABASE_SECRET_KEY` não é usada: pode ser apagada da Vercel.

Se o projeto mudar de mãos, gire `JWT_ACCESS_SECRET` (derruba todas as sessões) e a senha do
papel `finflow_api`, e transfira a posse do repositório, do time Vercel e do projeto Supabase.

## 3. Arquitetura

Monorepo pnpm + Turborepo, TypeScript, Node 22.

- `packages/shared` — regras puras: dinheiro em centavos, datas `yyyy-mm-dd`, ciclo de fatura,
  parcelas e recorrência, schemas Zod usados no cliente e no servidor.
- `packages/db` — Prisma 6 + migrations SQL à mão (RLS, CHECKs, views de saldo, funções).
- `apps/api` — NestJS 11, única porta de escrita no banco. Roda na Vercel como função (`api/index.js`).
- `apps/web` — Next.js 16 (App Router). Server Actions fazem papel de BFF; os tokens ficam em
  cookies httpOnly (`ff_at`, `ff_rt`, `ff_ws`) e o navegador nunca fala com a API.

Pontos que sustentam tudo:
- **Isolamento por RLS** — a API conecta como `finflow_api` (sem BYPASSRLS) e cada requisição roda
  em `prisma.asUser(userId, tx => …)`. O teste `isolation.test.ts` falha se uma tabela nova com
  `workspace_id` ficar sem RLS.
- **Saldos derivados** — views `account_balances` e `invoice_balances`; nunca coluna de saldo.
- **Compra no cartão pertence à fatura**; só o pagamento da fatura (`invoice_payment`) mexe na conta.
- **Transferência** = duas pernas (`transfer_out`/`transfer_in`) ligadas por `transfer_group_id`.
- **Auditoria** em toda escrita relevante (`AuditService.log`, na mesma transação).
- **Idempotência** nos POSTs de criação (`Idempotency-Key`).

## 4. O que está pronto e publicado

- Cadastro, login por senha (Argon2id), refresh com rotação e detecção de reuso, sessões.
- Espaços Pessoal e Casal, convites (link copiável), papéis dono/editor/leitor.
- Contas com saldo inicial, atual e previsto.
- Lançamentos: receita/despesa, pago/pendente, ignorar nos totais, parcelado, recorrente mensal,
  edição, exclusão com "Desfazer" (só este / este e os próximos).
- Cartões: cadastro, compras à vista e parceladas na fatura certa, faturas por mês
  (aberta/fechada/vencida/paga), pagamento total ou parcial, estorno (só pela API), limite disponível.
- Transferências entre contas.
- A pagar e receber: vencidas, hoje, 7 dias, mais adiante, com faturas e baixa em um toque.
- Início: saldo, resumo do mês, a pagar, cartões.

Testes: 42 em `shared` e 53 na API (integração contra Postgres real), todos passando.

## 5. Em andamento: login com Google (Supabase Auth)

Decisão: o Supabase só **confirma a identidade** do Google; quem entra recebe os tokens do
próprio FinFlow, então RLS, espaços e auditoria não mudam. Pedido do dono no lugar de e-mail de
recuperação de senha e de verificação em duas etapas (ambos descartados).

**Pronto (commit `ed60e97`, API):**
- `POST /auth/google { accessToken }` — a API chama `GET {SUPABASE_URL}/auth/v1/user` para validar
  o token, depois: identidade já vinculada → entra; e-mail igual a uma conta existente **e
  confirmado pelo Google** → vincula; senão cria conta com espaço Pessoal e categorias.
- Tabela `user_identities` (RLS, só a aplicação acessa); `users.password_hash` virou opcional.
- Sem `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` na API, o endpoint responde 503 (desligado).
- Testes em `apps/api/test/google.test.ts`.

**Web (pronto):** botão "Entrar com Google" em Entrar e Cadastro (`app/google-actions.ts`), retorno
em `app/auth/callback/route.ts` (troca o código, valida na API, grava a sessão do FinFlow e descarta
a do Supabase). O botão só aparece com `GOOGLE_LOGIN=on` na Web.

**Variáveis já na Vercel:** `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` (API e Web, chave pública) e
`SITE_URL` (Web). Falta só `GOOGLE_LOGIN=on` na Web, depois da configuração abaixo.

**Configuração que só o dono pode fazer (envolve segredo do Google):**
1. Google Cloud → APIs e serviços → Credenciais → ID do cliente OAuth (Aplicativo da Web).
   URI de redirecionamento autorizado: `https://ujhlhbwqqwhthsexypto.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Sign In / Providers → Google: ativar e colar Client ID e Secret.
3. Supabase → Authentication → URL Configuration: Site URL = endereço da Web; em Redirect URLs,
   `https://finflow-app-vh9p.vercel.app/auth/callback` e `http://localhost:3000/auth/callback`.

## 6. Pendências e dívidas conhecidas

- Editar um lançamento de série altera só aquele mês.
- Sem tela para editar ou arquivar conta.
- Estorno no cartão existe na API, sem botão na tela.
- Assinatura recorrente no cartão ainda não existe.
- Limite de tentativas de login é por instância serverless (sem Redis).
- "Esqueci a senha" não envia e-mail (sem provedor) — será substituído pelo login com Google.
- Descartados pelo dono por ora: janela de lançamento e tabela com colunas no computador,
  converter lançamento em transferência, e-mail de recuperação, verificação em duas etapas.

## 7. Roadmap

| Fase | Situação |
|---|---|
| 1. Análise (matriz Mobills, MVP, arquitetura, modelo de dados, navegação) | Concluída |
| 2. Design System e protótipos mobile | Concluída |
| 3. Fundação técnica e publicação | Concluída |
| 4. MVP | Funcionalidades principais prontas; login com Google aguardando configuração do provedor |
| 5. App mobile (mesma API) | Não iniciada |

## 8. Como trabalhar no repositório

- Rodar localmente e testar: ver [README](../README.md). Publicação do zero: [deploy.md](deploy.md).
- Antes de commitar: `pnpm build && pnpm typecheck && pnpm test` (precisa do Postgres local).
- Commits pequenos, Conventional Commits em inglês; textos da UI em pt-BR.
- Push na `main` publica Web e API; migrations novas rodam pelo workflow **Database** do GitHub.
  Migration publicada é irreversível: corrija com outra.
- O papel `finflow_owner` local não cria bancos, então `prisma migrate dev` falha (shadow DB).
  Gere a migration com
  `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`
  e acrescente à mão as regras que o Prisma não expressa (RLS, CHECK).
- No ambiente de agente, o Postgres local para entre sessões: `pg_ctlcluster 16 main start`.
