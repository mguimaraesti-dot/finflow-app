import { z } from 'zod';
import { isValidIsoDate, type IsoDate } from './dates.js';
import { invoiceForPurchase, type CardCycle } from './invoice.js';
import type { Cents } from './money.js';

export const CARD_BRANDS = ['visa', 'mastercard', 'elo', 'amex', 'hipercard', 'other'] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

export const CARD_BRAND_LABELS: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  elo: 'Elo',
  amex: 'American Express',
  hipercard: 'Hipercard',
  other: 'Outra',
};

export const MAX_CARD_INSTALLMENTS = 48;

const isoDate = z.string().refine(isValidIsoDate, 'Data inválida');
const positiveCents = z
  .number()
  .int('Valor inválido')
  .positive('Informe um valor maior que zero')
  .refine(Number.isSafeInteger, 'Valor fora do limite');
const day = (label: string) =>
  z.number({ invalid_type_error: `Informe o dia de ${label}` }).int().min(1, `Dia de ${label} inválido`).max(31, `Dia de ${label} inválido`);

const cardFields = {
  name: z.string().trim().min(1, 'Dê um nome ao cartão').max(60),
  brand: z.enum(CARD_BRANDS),
  limit: z.number().int().min(0, 'Limite inválido').refine(Number.isSafeInteger, 'Valor fora do limite'),
  closingDay: day('fechamento'),
  dueDay: day('vencimento'),
  paymentAccountId: z.string().uuid('Escolha a conta que paga a fatura'),
};

export const createCardSchema = z.object(cardFields);
export type CreateCardInput = z.infer<typeof createCardSchema>;

export const updateCardSchema = z
  .object(cardFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nada para alterar');
export type UpdateCardInput = z.infer<typeof updateCardSchema>;

const purchaseFields = {
  amount: positiveCents,
  description: z.string().trim().min(1, 'Descreva a compra').max(120),
  date: isoDate,
  categoryId: z.string().uuid().nullable(),
  installments: z.number().int().min(1).max(MAX_CARD_INSTALLMENTS, `Máximo de ${MAX_CARD_INSTALLMENTS} parcelas`),
  notes: z.string().trim().max(500).nullable(),
};

/** Compra no cartão. `income` é estorno/crédito na fatura. */
export const createCardPurchaseSchema = z.object({
  kind: z.enum(['expense', 'income']).default('expense'),
  ...purchaseFields,
  categoryId: purchaseFields.categoryId.optional(),
  installments: purchaseFields.installments.default(1),
  notes: purchaseFields.notes.optional(),
});
export type CreateCardPurchaseInput = z.infer<typeof createCardPurchaseSchema>;

export const updateCardPurchaseSchema = z
  .object(purchaseFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nada para alterar');
export type UpdateCardPurchaseInput = z.infer<typeof updateCardPurchaseSchema>;

export const payInvoiceSchema = z.object({
  amount: positiveCents,
  accountId: z.string().uuid('Escolha a conta'),
  date: isoDate.optional(),
});
export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>;

export type InvoiceStatus = 'future' | 'open' | 'closed' | 'overdue' | 'paid';

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  future: 'Futura',
  open: 'Aberta',
  closed: 'Fechada',
  overdue: 'Vencida',
  paid: 'Paga',
};

export interface InvoiceFigures {
  referenceMonth: IsoDate;
  dueDate: IsoDate;
  total: Cents;
  paid: Cents;
}

/**
 * Situação de uma fatura em relação a "hoje".
 * A fatura aberta é a que recebe uma compra feita hoje; as seguintes são futuras.
 */
export function invoiceStatus(card: CardCycle, invoice: InvoiceFigures, today: IsoDate): InvoiceStatus {
  const current = invoiceForPurchase(card, today).referenceMonth;
  const settled = invoice.total > 0 && invoice.paid >= invoice.total;
  if (invoice.referenceMonth > current) return settled ? 'paid' : 'future';
  if (invoice.referenceMonth === current) return settled ? 'paid' : 'open';
  if (invoice.paid >= invoice.total) return 'paid';
  return today > invoice.dueDate ? 'overdue' : 'closed';
}
