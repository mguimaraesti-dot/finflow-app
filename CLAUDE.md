# FinFlow — guia do repositório

Fonte da verdade sobre arquitetura e convenções. Decisões detalhadas em `docs/decisions/`.

## Produto
Gestão financeira pessoal. Toda pessoa tem um espaço **Pessoal** (só ela); pode criar um espaço
**Casal** (até 2 membros no MVP) por convite. Contas, cartões e lançamentos pertencem a um espaço.

## Regras que não mudam sem conversar com o dono do projeto
1. **Dinheiro é inteiro em centavos** (`BIGINT` no banco, `number` seguro no código). Nunca float.
   Conversão para texto só na borda (`formatBRL`, `parseBRL` em `@finflow/shared`).
2. **Datas de calendário são `DATE` / string `yyyy-mm-dd`**, sem fuso. "Hoje" usa o fuso do espaço
   (`todayIn`). Eventos usam `timestamptz`.
3. **Saldos e totais de fatura são derivados** (views `account_balances`, `invoice_balances`).
   Nunca guardar saldo em coluna.
4. **Compra no cartão pertence à fatura, não à conta.** Só o pagamento da fatura (`invoice_payment`)
   mexe no saldo da conta. O banco garante isso (`transactions_target_shape`).
5. **Transferência = dois lançamentos ligados por `transfer_group_id`**, fora de receitas/despesas.
6. **Ciclo de fatura vem de `@finflow/shared/invoice`.** Compra no dia do fechamento vai para a
   fatura seguinte; dia 31 vira o último dia em meses curtos. Não reimplementar em outro lugar.
7. **Isolamento por Row-Level Security.** A API usa o papel `finflow_app` (sem BYPASSRLS) e acessa
   dados de espaço só dentro de `prisma.asUser(userId, tx => ...)`. Toda tabela nova com
   `workspace_id` precisa de RLS e das 4 políticas — o teste de isolamento falha se faltar.
8. **Toda escrita relevante gera auditoria** (`AuditService.log`), na mesma transação.
9. **Mesmo schema Zod no cliente e no servidor** (`@finflow/shared/schemas`).
10. **Tokens nunca chegam ao navegador:** a Web guarda access/refresh em cookies httpOnly e chama a
    API pelo servidor.

## Fluxo de trabalho
- Commits pequenos e temáticos, Conventional Commits em inglês. Textos da UI em pt-BR.
- Antes de commitar: `pnpm build && pnpm typecheck && pnpm test` (testes precisam do Postgres local).
- Migrations: `packages/db/prisma/migrations`. Regras que o Prisma não expressa (RLS, CHECK, views,
  funções) vão em migrations SQL escritas à mão. Migration publicada é irreversível: corrija com outra.
- Push direto na `main` (decisão do dono do projeto). O CI roda build, tipos e testes.

## Não adicionar sem motivo registrado em ADR
Novo ORM, gerenciador de estado global, biblioteca de gráficos pesada, microsserviços.
