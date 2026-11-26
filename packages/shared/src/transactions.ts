import { z } from 'zod';
import { addMonths, addMonthsYM, clampedDate, daysInMonth, isValidIsoDate, type IsoDate } from './dates.js';
import { splitInstallments, type Cents } from './money.js';

/** Lançamentos em conta (receita/despesa). Cartão e transferência têm regras próprias. */

const isoDate = z.string().refine(isValidIsoDate, 'Data inválida');
const positiveCents = z
  .number()
  .int('Valor inválido')
  .positive('Informe um valor maior que zero')
  .refine(Number.isSafeInteger, 'Valor fora do limite');

export const MAX_INSTALLMENTS = 72;
/** Quantas ocorrências de uma recorrência sem fim ficam criadas à frente. */
export const RECURRING_WINDOW = 12;

export const repeatSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('installment'), count: z.number().int().min(2, 'Mínimo de 2 parcelas').max(MAX_INSTALLMENTS) }),
  z.object({
    type: z.literal('monthly'),
    /** Quantas vezes; ausente = sem fim (mantém RECURRING_WINDOW meses criados). */
    count: z.number().int().min(2).max(120).optional(),
  }),
]);
export type Repeat = z.infer<typeof repeatSchema>;

export const createTransactionSchema = z.object({
  kind: z.enum(['income', 'expense']),
  amount: positiveCents,
  description: z.string().trim().min(1, 'Descreva o lançamento').max(120),
  date: isoDate,
  accountId: z.string().uuid('Escolha uma conta'),
  categoryId: z.string().uuid().nullable().optional(),
  paid: z.boolean().default(false),
  ignored: z.boolean().default(false),
  notes: z.string().trim().max(500).optional(),
  repeat: repeatSchema.default({ type: 'none' }),
});
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = z
  .object({
    amount: positiveCents,
    description: z.string().trim().min(1, 'Descreva o lançamento').max(120),
    date: isoDate,
    accountId: z.string().uuid(),
    categoryId: z.string().uuid().nullable(),
    ignored: z.boolean(),
    notes: z.string().trim().max(500).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nada para alterar');
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export const payTransactionSchema = z.object({ paidAt: isoDate.optional() });

export const DELETE_SCOPES = ['this', 'future'] as const;
export type DeleteScope = (typeof DELETE_SCOPES)[number];

/** "2026-11" → primeiro e último dia do mês. */
export function monthRange(month: string): { from: IsoDate; to: IsoDate } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new RangeError(`Mês inválido: ${month}`);
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) throw new RangeError(`Mês inválido: ${month}`);
  return { from: clampedDate(year, mon, 1), to: clampedDate(year, mon, daysInMonth(year, mon)) };
}

export function isValidMonth(month: string): boolean {
  try {
    monthRange(month);
    return true;
  } catch {
    return false;
  }
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const t = addMonthsYM(y, m, delta);
  return `${t.year}-${String(t.month).padStart(2, '0')}`;
}

export interface Occurrence {
  date: IsoDate;
  amount: Cents;
  installmentNumber: number | null;
}

/**
 * Ocorrências de um lançamento.
 * - Parcelado: divide o total (resto na 1ª) e repete mês a mês.
 * - Mensal: mesmo valor; com `count` gera todas, sem `count` gera a janela de RECURRING_WINDOW.
 * O dia é mantido e limitado ao fim de meses curtos (31 → 28/29/30), sempre a partir da data original.
 */
export function planOccurrences(date: IsoDate, amount: Cents, repeat: Repeat): Occurrence[] {
  if (repeat.type === 'none') return [{ date, amount, installmentNumber: null }];
  if (repeat.type === 'installment') {
    return splitInstallments(amount, repeat.count).map((value, i) => ({
      date: addMonths(date, i),
      amount: value,
      installmentNumber: i + 1,
    }));
  }
  const n = repeat.count ?? RECURRING_WINDOW;
  return Array.from({ length: n }, (_, i) => ({ date: addMonths(date, i), amount, installmentNumber: null }));
}
