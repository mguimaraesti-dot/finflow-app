import { INVOICE_STATUS_LABELS } from '@finflow/shared';
import type { InvoiceStatus } from '@/lib/types';

const TONE: Record<InvoiceStatus, string> = {
  open: 'bg-brand-tint text-brand-strong',
  future: 'bg-surface-2 text-ink-2',
  closed: 'bg-warning-tint text-warning',
  overdue: 'bg-expense-tint text-expense',
  paid: 'bg-income-tint text-income',
};

export function InvoiceStatusChip({ status }: { status: InvoiceStatus }) {
  return <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold ${TONE[status]}`}>{INVOICE_STATUS_LABELS[status]}</span>;
}

/** "2026-12-01" → "01/12" */
export const shortDate = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');
