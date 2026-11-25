import { addMonthsYM, clampedDate, compareIsoDate, parseIsoDate, type IsoDate } from './dates.js';
import { splitInstallments, type Cents } from './money.js';

export interface CardCycle {
  /** Dia de fechamento (1-31). Meses curtos usam o último dia. */
  closingDay: number;
  /** Dia de vencimento (1-31). */
  dueDay: number;
}

export interface InvoiceSlot {
  /** Mês de referência, nomeado pelo vencimento ("fatura de dezembro"): yyyy-mm-01. */
  referenceMonth: IsoDate;
  /** Último dia em que compras ainda entram nesta fatura é o dia anterior a este. */
  closingDate: IsoDate;
  dueDate: IsoDate;
}

function assertDay(day: number, label: string) {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError(`${label} inválido: ${day}`);
  }
}

/** Fatura que fecha no ano/mês informado. */
export function invoiceClosingIn(card: CardCycle, year: number, month: number): InvoiceSlot {
  assertDay(card.closingDay, 'Dia de fechamento');
  assertDay(card.dueDay, 'Dia de vencimento');
  const closingDate = clampedDate(year, month, card.closingDay);
  // Vencimento depois do fechamento no mesmo mês, senão no mês seguinte.
  const dueYM = card.dueDay > card.closingDay ? { year, month } : addMonthsYM(year, month, 1);
  const dueDate = clampedDate(dueYM.year, dueYM.month, card.dueDay);
  return {
    referenceMonth: clampedDate(dueYM.year, dueYM.month, 1),
    closingDate,
    dueDate,
  };
}

/**
 * Fatura de uma compra feita em `purchaseDate`.
 * Regra de mercado: compra no próprio dia do fechamento já vai para a fatura seguinte
 * (o dia do fechamento é o "melhor dia de compra").
 */
export function invoiceForPurchase(card: CardCycle, purchaseDate: IsoDate): InvoiceSlot {
  const { year, month } = parseIsoDate(purchaseDate);
  const thisMonth = invoiceClosingIn(card, year, month);
  if (compareIsoDate(purchaseDate, thisMonth.closingDate) < 0) return thisMonth;
  const next = addMonthsYM(year, month, 1);
  return invoiceClosingIn(card, next.year, next.month);
}

/** A fatura `offset` ciclos depois de `slot` (offset 0 = a própria). */
export function shiftInvoice(card: CardCycle, slot: InvoiceSlot, offset: number): InvoiceSlot {
  const { year, month } = parseIsoDate(slot.closingDate);
  const target = addMonthsYM(year, month, offset);
  return invoiceClosingIn(card, target.year, target.month);
}

export interface InstallmentPlan {
  number: number;
  total: number;
  amount: Cents;
  invoice: InvoiceSlot;
}

/** Parcelas de uma compra no cartão: valor exato por parcela e a fatura de cada uma. */
export function planCardInstallments(
  card: CardCycle,
  purchaseDate: IsoDate,
  totalAmount: Cents,
  installments: number,
): InstallmentPlan[] {
  const first = invoiceForPurchase(card, purchaseDate);
  return splitInstallments(totalAmount, installments).map((amount, i) => ({
    number: i + 1,
    total: installments,
    amount,
    invoice: shiftInvoice(card, first, i),
  }));
}

/** Melhor dia de compra = o próprio dia do fechamento (entra na fatura seguinte). */
export function bestPurchaseDay(card: CardCycle): number {
  return card.closingDay;
}
