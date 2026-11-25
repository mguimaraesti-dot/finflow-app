/**
 * Dinheiro é sempre inteiro em centavos dentro do domínio e no banco (BIGINT).
 * Conversão para texto só na borda (UI, relatórios).
 */
export type Cents = number;

export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Valor em centavos inválido: ${value}`);
  }
  return value;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 123456 → "R$ 1.234,56"; negativos usam o sinal de menos tipográfico (−). */
export function formatBRL(cents: Cents): string {
  assertCents(cents);
  const text = brl.format(Math.abs(cents) / 100).replace(/ /g, ' ');
  return cents < 0 ? `− ${text}` : text;
}

/**
 * Aceita "1.234,56", "1234,5", "R$ 10", "10.5" (ponto decimal só se não houver vírgula).
 * Devolve centavos ou null quando o texto não é um valor.
 */
export function parseBRL(input: string): Cents | null {
  const cleaned = input.replace(/[R$\s ]/g, '').replace(/[−–]/g, '-');
  if (!cleaned) return null;
  let normalized: string;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '');
  } else {
    normalized = cleaned;
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const negative = normalized.startsWith('-');
  const [whole = '0', frac = ''] = normalized.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/**
 * Divide um total em n parcelas que somam exatamente o total.
 * A diferença de arredondamento vai para a primeira parcela.
 */
export function splitInstallments(total: Cents, count: number): Cents[] {
  assertCents(total);
  if (!Number.isInteger(count) || count < 1 || count > 420) {
    throw new RangeError(`Quantidade de parcelas inválida: ${count}`);
  }
  const base = Math.trunc(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}
