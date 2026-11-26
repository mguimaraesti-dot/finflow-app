import type { Metadata } from 'next';
import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { formatBRL, todayIn } from '@finflow/shared';
import { AppShell } from '@/components/app-shell';
import { CardForm } from '@/components/card-form';
import { InvoiceStatusChip, shortDate } from '@/components/invoice-status';
import { api } from '@/lib/api';
import { monthLabel } from '@/lib/format';
import { getContext } from '@/lib/session';
import type { AccountSummary, CardSummary } from '@/lib/types';

export const metadata: Metadata = { title: 'Cartões' };

export default async function Page() {
  const here = '/cartoes';
  const ctx = await getContext(here);
  const [cards, accounts] = await Promise.all([
    api<CardSummary[]>(`/workspaces/${ctx.active.id}/cards`, { returnTo: here }),
    api<AccountSummary[]>(`/workspaces/${ctx.active.id}/accounts`, { returnTo: here }),
  ]);
  const today = todayIn('America/Sao_Paulo');
  const canWrite = ctx.active.role === 'owner' || ctx.active.role === 'editor';

  return (
    <AppShell {...ctx} current="/cartoes">
      <h1 className="text-[20px] font-semibold">Cartões</h1>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[20px] bg-surface p-6 text-center">
          <CreditCard size={32} strokeWidth={1.5} className="text-ink-3" aria-hidden />
          <p className="text-[15px]">Nenhum cartão ainda.</p>
          <p className="text-[13px] text-ink-2">Cadastre um cartão para lançar compras, acompanhar a fatura e o limite.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {cards.map((c) => {
            const usedPct = c.limit > 0 ? Math.min(100, Math.round((c.used / c.limit) * 100)) : 0;
            const inv = c.currentInvoice;
            return (
              <li key={c.id}>
                <Link href={`/cartoes/${c.id}`} className="flex flex-col gap-3 rounded-[20px] bg-surface p-4 hover:bg-surface-2/40">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[16px] font-semibold">
                      <CreditCard size={20} strokeWidth={1.5} aria-hidden /> {c.name}
                    </span>
                    <InvoiceStatusChip status={inv.status} />
                  </div>
                  <div>
                    <p className="text-[13px] text-ink-2">Fatura de {monthLabel(inv.month).toLowerCase()} · vence {shortDate(inv.dueDate)}</p>
                    <p className="num text-[24px] font-semibold">{formatBRL(Math.max(inv.total - inv.paid, 0))}</p>
                  </div>
                  {c.due.map((d) => (
                    <p key={d.month} className={`rounded-[8px] px-3 py-2 text-[13px] font-semibold ${d.dueDate < today ? 'bg-expense-tint text-expense' : 'bg-warning-tint text-warning'}`}>
                      Fatura de {monthLabel(d.month).toLowerCase()}: {formatBRL(d.remaining)} {d.dueDate < today ? `venceu em ${shortDate(d.dueDate)}` : `a pagar até ${shortDate(d.dueDate)}`}
                    </p>
                  ))}
                  <div className="flex flex-col gap-1">
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPct} aria-label="Limite usado">
                      <div className={`h-full rounded-full ${usedPct >= 90 ? 'bg-expense' : 'bg-brand'}`} style={{ width: `${usedPct}%` }} />
                    </div>
                    <p className="flex justify-between text-[13px] text-ink-2">
                      <span>
                        Disponível <span className={`num font-semibold ${c.available < 0 ? 'text-expense' : 'text-ink'}`}>{formatBRL(c.available)}</span>
                      </span>
                      <span className="num">de {formatBRL(c.limit)}</span>
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {canWrite ? (
        <details className="rounded-[12px] bg-surface p-4" open={cards.length === 0}>
          <summary className="cursor-pointer text-[15px] font-semibold text-brand">Novo cartão</summary>
          <div className="mt-4">
            <CardForm workspaceId={ctx.active.id} accounts={accounts} />
          </div>
        </details>
      ) : null}
    </AppShell>
  );
}
