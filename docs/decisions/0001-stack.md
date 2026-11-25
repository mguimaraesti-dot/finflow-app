# 0001 — Stack e forma do sistema

Data: 25/11/2026 · Status: aceita

## Decisão
Monólito modular em TypeScript num monorepo pnpm + Turborepo:
- `apps/api`: NestJS 11 (REST). Única porta de escrita no banco.
- `apps/web`: Next.js 16 (App Router), sem acesso direto ao banco.
- `apps/mobile` (Fase 5): Expo, consumindo a mesma API.
- `packages/shared`: regras puras (dinheiro, datas, faturas) e schemas Zod.
- `packages/db`: Prisma 6 + migrations SQL para o que o Prisma não expressa.
- PostgreSQL 16 (local, Supabase ou RDS — só o Postgres; a autenticação é nossa).

## Por quê
- Uma linguagem e as mesmas regras de fatura/dinheiro em Web, Mobile e API.
- API separada porque o app móvel e integrações futuras (Open Finance, IA) precisam de um backend
  que não seja o servidor da Web.
- Monólito modular evita custo e inconsistência de microsserviços num produto deste tamanho.

## Versões
Fixadas em linhas estáveis conhecidas (NestJS 11, Prisma 6, TypeScript 5.9, Zod 3, Vitest 3).
Prisma 7, Zod 4 e TypeScript 7 existem; subir de versão é uma tarefa própria, com os testes como rede.

## Alternativas descartadas
- Supabase Auth + acesso direto do cliente: amarra a regra de negócio ao provedor e ao cliente.
- Projeto anterior (`mguimaraesti-dot/finflow`, Next + Supabase): continua no ar até este substituí-lo.
