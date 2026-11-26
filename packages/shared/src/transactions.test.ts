import { describe, expect, it } from 'vitest';
import { createTransactionSchema, monthRange, planOccurrences, shiftMonth } from './transactions.js';

describe('planOccurrences', () => {
  it('lançamento único', () => {
    expect(planOccurrences('2026-11-26', 5000, { type: 'none' })).toEqual([
      { date: '2026-11-26', amount: 5000, installmentNumber: null },
    ]);
  });

  it('parcelado soma o total e mantém o dia, limitado ao fim do mês', () => {
    const plan = planOccurrences('2026-01-31', 100000, { type: 'installment', count: 3 });
    expect(plan.map((p) => p.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(plan.map((p) => p.amount)).toEqual([33334, 33333, 33333]);
    expect(plan.map((p) => p.installmentNumber)).toEqual([1, 2, 3]);
  });

  it('mensal sem fim cria 12 meses; com fim cria a quantidade pedida', () => {
    expect(planOccurrences('2026-11-10', 12990, { type: 'monthly' })).toHaveLength(12);
    const fixed = planOccurrences('2026-11-10', 12990, { type: 'monthly', count: 3 });
    expect(fixed.map((p) => p.date)).toEqual(['2026-11-10', '2026-12-10', '2027-01-10']);
    expect(fixed.every((p) => p.amount === 12990)).toBe(true);
  });
});

describe('meses', () => {
  it('monthRange cobre o mês inteiro, inclusive fevereiro bissexto', () => {
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(() => monthRange('2026-13')).toThrow();
  });
  it('shiftMonth vira o ano', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('createTransactionSchema', () => {
  it('recusa valor zero e aplica padrões', () => {
    const base = { kind: 'expense', description: 'Mercado', date: '2026-11-26', accountId: '6c4b1e8e-2f6d-4c8a-9b8e-1a2b3c4d5e6f' };
    expect(createTransactionSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
    const ok = createTransactionSchema.parse({ ...base, amount: 1000 });
    expect(ok).toMatchObject({ paid: false, ignored: false, repeat: { type: 'none' } });
  });
});
