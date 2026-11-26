import { describe, expect, it } from 'vitest';
import { createCardPurchaseSchema, createCardSchema, invoiceStatus } from './cards.js';

const card = { closingDay: 20, dueDay: 1 }; // fecha 20, vence dia 1 do mês seguinte

describe('invoiceStatus', () => {
  const today = '2026-11-26'; // depois do fechamento de 20/11 → fatura aberta é a de jan/27
  const inv = (referenceMonth: string, dueDate: string, total: number, paid = 0) => ({ referenceMonth, dueDate, total, paid });

  it('fatura que recebe compras de hoje está aberta', () => {
    expect(invoiceStatus(card, inv('2027-01-01', '2027-01-01', 5000), today)).toBe('open');
  });

  it('faturas seguintes são futuras', () => {
    expect(invoiceStatus(card, inv('2027-02-01', '2027-02-01', 5000), today)).toBe('future');
  });

  it('fechada e ainda no prazo', () => {
    expect(invoiceStatus(card, inv('2026-12-01', '2026-12-01', 5000), today)).toBe('closed');
  });

  it('vencida quando passou do vencimento com saldo devedor', () => {
    expect(invoiceStatus(card, inv('2026-11-01', '2026-11-01', 5000, 2000), today)).toBe('overdue');
  });

  it('paga quando o pagamento cobre o total, inclusive antecipado', () => {
    expect(invoiceStatus(card, inv('2026-11-01', '2026-11-01', 5000, 5000), today)).toBe('paid');
    expect(invoiceStatus(card, inv('2027-01-01', '2027-01-01', 5000, 5000), today)).toBe('paid');
  });

  it('fatura aberta sem gastos continua aberta', () => {
    expect(invoiceStatus(card, inv('2027-01-01', '2027-01-01', 0), today)).toBe('open');
  });
});

describe('schemas de cartão', () => {
  it('valida dias de fechamento e vencimento', () => {
    const base = { name: 'Nubank', brand: 'mastercard', limit: 500000, paymentAccountId: '7b8c1c5e-4e0a-4b8f-9f3e-2d6a1b0c9e11' };
    expect(createCardSchema.safeParse({ ...base, closingDay: 3, dueDay: 10 }).success).toBe(true);
    expect(createCardSchema.safeParse({ ...base, closingDay: 0, dueDay: 10 }).success).toBe(false);
    expect(createCardSchema.safeParse({ ...base, closingDay: 3, dueDay: 32 }).success).toBe(false);
  });

  it('compra à vista por padrão', () => {
    const r = createCardPurchaseSchema.parse({ amount: 1000, description: 'Café', date: '2026-11-26' });
    expect(r).toMatchObject({ kind: 'expense', installments: 1 });
  });
});
