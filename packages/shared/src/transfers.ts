import { z } from 'zod';
import { isValidIsoDate } from './dates.js';

const isoDate = z.string().refine(isValidIsoDate, 'Data inválida');
const positiveCents = z
  .number()
  .int('Valor inválido')
  .positive('Informe um valor maior que zero')
  .refine(Number.isSafeInteger, 'Valor fora do limite');

const fields = {
  fromAccountId: z.string().uuid('Escolha a conta de origem'),
  toAccountId: z.string().uuid('Escolha a conta de destino'),
  amount: positiveCents,
  date: isoDate,
  description: z.string().trim().min(1).max(120),
  paid: z.boolean(),
  notes: z.string().trim().max(500).nullable(),
};

const differentAccounts = (v: { fromAccountId?: string; toAccountId?: string }) =>
  !v.fromAccountId || !v.toAccountId || v.fromAccountId !== v.toAccountId;
const differentMessage = { message: 'Escolha contas diferentes', path: ['toAccountId'] };

/** Transferência entre contas do mesmo espaço: não é receita nem despesa. */
export const createTransferSchema = z
  .object({
    ...fields,
    description: fields.description.default('Transferência'),
    paid: fields.paid.default(true),
    notes: fields.notes.optional(),
  })
  .refine(differentAccounts, differentMessage);
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

export const updateTransferSchema = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nada para alterar')
  .refine(differentAccounts, differentMessage);
export type UpdateTransferInput = z.infer<typeof updateTransferSchema>;
