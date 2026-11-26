import type { Metadata } from 'next';
import Link from 'next/link';
import { formatBRL, todayIn } from '@finflow/shared';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api';
import { getContext } from '@/lib/session';
import { InvoiceStatusChip, shortDate } from '@/components/invoice-status';
import { monthLabel } from '@/lib/format';
import type { AccountSummary, CardSummary, TransactionList } from '@/lib/types';
import { NewAccountForm } from './new-account-form';

export const metadata: Metadata = { title: 'Início' };

export default async function Page() {
  const ctx = await getContext('/inicio');
  const today = todayIn('America/Sao_Paulo');
  const [accounts, month, cards] = await Promise.all([
    api<AccountSummary[]>(`/workspaces/${ctx.active.id}/accounts`, { returnTo: '/inicio' }),
    api<TransactionList>(`/workspaces/${ctx.active.id}/transactions?month=${today.slice(0, 7)}`, { returnTo: '/inicio' }),
    api<CardSummary[]>(`/workspaces/${ctx.active.id}/cards`, { returnTo: '/inicio' }),
  ]);
  const invoicesDue = cards.flatMap((c) => c.due.map((d) => ({ ...d, card: c })));
  const invoicesOpen = cards.reduce(
    (s, c) => s + c.due.reduce((x, d) => x + d.remaining, 0) + Math.max(c.currentInvoice.total - c.currentInvoice.paid, 0),
    0,
  );
  const upcoming = month.items
    .filter((t) => t.status === 'pending' && !t.ignored && t.kind === 'expense' && !t.card)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  const counted = accounts.filter((a) => a.includeInTotal);
  const total = counted.reduce((s, a) => s + a.currentBalance, 0);
  const projected = counted.reduce((s, a) => s + a.projectedBalance, 0) - invoicesOpen;
  const canWrite = ctx.active.role === 'owner' || ctx.active.role === 'editor';

  return (
    <AppShell {...ctx} current="/inicio">
      <section className="rounded-[20px] bg-surface px-4 py-6">
        <p className="text-[13px] text-ink-2">Saldo atual em contas · {ctx.active.name}</p>
        <p className={`num mt-1 text-[32px] font-semibold leading-[38px] tracking-[-0.5px] ${total < 0 ? 'text-expense' : ''}`}>{formatBRL(total)}</p>
        <div className="mt-4 flex gap-6">
          <p className="text-[13px] text-ink-2">
            Receitas do mês<span className="num block text-[17px] font-semibold text-income">+ {formatBRL(month.summary.income)}</span>
          </p>
          <p className="text-[13px] text-ink-2">
            Despesas do mês<span className="num block text-[17px] font-semibold text-expense">− {formatBRL(month.summary.expense)}</span>
          </p>
        </div>
        <p className="mt-4 flex justify-between border-t border-border pt-3 text-[13px] text-ink-2">
          {invoicesOpen > 0 ? 'Previsto com pendentes e faturas' : 'Previsto com pendentes'} <span className="num font-semibold text-ink">{formatBRL(projected)}</span>
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[16px] font-semibold">Contas</h2>
        {accounts.length === 0 ? (
          <p className="rounded-[12px] bg-surface p-4 text-[15px] text-ink-2">Cadastre sua primeira conta para ver seu saldo.</p>
        ) : (
          <ul className="overflow-hidden rounded-[12px] bg-surface">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between border-t border-border px-4 py-3 first:border-t-0">
                <span className="text-[15px]">{a.name}</span>
                <span className={`num text-[15px] font-semibold ${a.currentBalance < 0 ? 'text-expense' : ''}`}>{formatBRL(a.currentBalance)}</span>
              </li>
            ))}
          </ul>
        )}
        {canWrite ? <NewAccountForm workspaceId={ctx.active.id} /> : <p className="text-[13px] text-ink-2">Você tem acesso só de leitura neste espaço.</p>}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[16px] font-semibold">A pagar</h2>
          <Link href="/lancamentos?filtro=pendentes" className="text-[13px] font-semibold text-brand">Ver todos</Link>
        </div>
        {upcoming.length === 0 && invoicesDue.length === 0 ? (
          <p className="rounded-[12px] bg-surface p-4 text-[15px] text-ink-2">Nada pendente neste mês.</p>
        ) : (
          <ul className="overflow-hidden rounded-[12px] bg-surface">
            {invoicesDue.map((d) => (
              <li key={`${d.card.id}-${d.month}`} className="border-t border-border first:border-t-0">
                <Link href={`/cartoes/${d.card.id}?mes=${d.month}`} className="flex items-center justify-between px-4 py-3">
                  <span>
                    <span className="block text-[15px]">Fatura {d.card.name}</span>
                    <span className={`block text-[13px] ${d.dueDate < today ? 'font-semibold text-expense' : 'text-ink-2'}`}>
                      {d.dueDate < today ? 'Vencida em ' : 'Vence em '}
                      {shortDate(d.dueDate)}
                    </span>
                  </span>
                  <span className="num text-[15px] font-semibold text-expense">− {formatBRL(d.remaining)}</span>
                </Link>
              </li>
            ))}
            {upcoming.map((t) => (
              <li key={t.id} className="border-t border-border first:border-t-0">
                <Link href={`/lancamentos/${t.id}`} className="flex items-center justify-between px-4 py-3">
                  <span>
                    <span className="block text-[15px]">{t.description}</span>
                    <span className={`block text-[13px] ${t.date < today ? 'font-semibold text-expense' : 'text-ink-2'}`}>
                      {t.date < today ? 'Vencido em ' : 'Vence em '}
                      {t.date.split('-').reverse().slice(0, 2).join('/')}
                    </span>
                  </span>
                  <span className="num text-[15px] font-semibold text-expense">− {formatBRL(t.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {cards.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[16px] font-semibold">Cartões</h2>
            <Link href="/cartoes" className="text-[13px] font-semibold text-brand">Ver todos</Link>
          </div>
          <ul className="overflow-hidden rounded-[12px] bg-surface">
            {cards.map((c) => (
              <li key={c.id} className="border-t border-border first:border-t-0">
                <Link href={`/cartoes/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">{c.name}</span>
                    <span className="block text-[13px] text-ink-2">
                      Fatura de {monthLabel(c.currentInvoice.month).toLowerCase().split(' de ')[0]} · disponível {formatBRL(c.available)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="num text-[15px] font-semibold">{formatBRL(Math.max(c.currentInvoice.total - c.currentInvoice.paid, 0))}</span>
                    <InvoiceStatusChip status={c.currentInvoice.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Link href="/cartoes" className="rounded-[12px] bg-surface p-4 text-[15px] font-semibold text-brand">Cadastrar um cartão de crédito</Link>
      )}

      <p className="text-[13px] text-ink-2">Transferências entre contas chegam no próximo incremento.</p>
    </AppShell>
  );
}
