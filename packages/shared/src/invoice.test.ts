import { describe, expect, it } from 'vitest';
import { addMonths } from './dates.js';
import { invoiceForPurchase, planCardInstallments, shiftInvoice } from './invoice.js';

const visa = { closingDay: 20, dueDay: 1 }; // fecha 20, vence 1 do mês seguinte
const sameMonth = { closingDay: 3, dueDay: 10 }; // fecha 3, vence 10 do mesmo mês
const endOfMonth = { closingDay: 31, dueDay: 8 };

describe('invoiceForPurchase', () => {
  it('compra antes do fechamento entra na fatura do mês', () => {
    expect(invoiceForPurchase(visa, '2026-11-12')).toEqual({
      referenceMonth: '2026-12-01',
      closingDate: '2026-11-20',
      dueDate: '2026-12-01',
    });
  });

  it('compra no dia do fechamento vai para a fatura seguinte', () => {
    expect(invoiceForPurchase(visa, '2026-11-20')).toEqual({
      referenceMonth: '2027-01-01',
      closingDate: '2026-12-20',
      dueDate: '2027-01-01',
    });
  });

  it('vencimento no mesmo mês do fechamento quando o dia é maior', () => {
    expect(invoiceForPurchase(sameMonth, '2026-11-02')).toEqual({
      referenceMonth: '2026-11-01',
      closingDate: '2026-11-03',
      dueDate: '2026-11-10',
    });
  });

  it('fechamento dia 31 usa o último dia de meses curtos', () => {
    expect(invoiceForPurchase(endOfMonth, '2027-02-15').closingDate).toBe('2027-02-28');
    expect(invoiceForPurchase(endOfMonth, '2028-02-15').closingDate).toBe('2028-02-29');
    expect(invoiceForPurchase(endOfMonth, '2027-02-28').closingDate).toBe('2027-03-31');
  });

  it('vira o ano corretamente', () => {
    expect(invoiceForPurchase(visa, '2026-12-25')).toEqual({
      referenceMonth: '2027-02-01',
      closingDate: '2027-01-20',
      dueDate: '2027-02-01',
    });
  });

  it('toda compra fica antes do fechamento da sua fatura e depois do fechamento anterior', () => {
    for (const card of [visa, sameMonth, endOfMonth, { closingDay: 29, dueDay: 29 }]) {
      let date = '2026-01-01';
      for (let i = 0; i < 800; i++) {
        const slot = invoiceForPurchase(card, date);
        const previous = shiftInvoice(card, slot, -1);
        expect(date < slot.closingDate).toBe(true);
        expect(date >= previous.closingDate).toBe(true);
        expect(slot.dueDate >= slot.closingDate).toBe(true);
        date = nextDay(date);
      }
    }
  });
});

describe('planCardInstallments', () => {
  it('distribui as parcelas em faturas consecutivas e fecha o total', () => {
    const plan = planCardInstallments(visa, '2026-11-21', 96000, 3);
    expect(plan.map((p) => p.invoice.referenceMonth)).toEqual(['2027-01-01', '2027-02-01', '2027-03-01']);
    expect(plan.map((p) => p.amount)).toEqual([32000, 32000, 32000]);
    expect(plan.map((p) => `${p.number}/${p.total}`)).toEqual(['1/3', '2/3', '3/3']);
  });

  it('arredonda sem perder centavos', () => {
    const plan = planCardInstallments(visa, '2026-11-01', 10000, 3);
    expect(plan.reduce((s, p) => s + p.amount, 0)).toBe(10000);
  });
});

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('addMonths', () => {
  it('limita o dia ao fim do mês', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 2)).toBe('2027-02-15');
  });
});
