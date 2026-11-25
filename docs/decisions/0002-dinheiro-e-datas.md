# 0002 — Dinheiro em centavos e datas sem fuso

Data: 25/11/2026 · Status: aceita

## Decisão
- Valores monetários: `BIGINT` em centavos no banco (`*_cents`), `number` inteiro no código,
  validado com `Number.isSafeInteger` na conversão (`toCents`).
- Parcelas: `splitInstallments` divide o total e põe o resto do arredondamento na 1ª parcela; a soma
  sempre fecha com o total.
- Competência e vencimento: `DATE`. No código, string `yyyy-mm-dd`. Nunca `new Date('yyyy-mm-dd')`
  com horário local.
- "Hoje" e "vencido" usam o fuso do espaço (`workspaces.timezone`, padrão America/Sao_Paulo).

## Por quê
Float erra centavos; NUMERIC exige conversão para Decimal em todo lugar. Centavos inteiros fazem a
aritmética do domínio exata e simples, e cabem até ~90 trilhões de reais.
