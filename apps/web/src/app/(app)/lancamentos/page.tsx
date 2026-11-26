import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatBRL, isValidMonth, shiftMonth, todayIn } from '@finflow/shared';
import { restoreTransactionsAction, togglePaidAction } from '@/app/transaction-actions';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api';
import { dayLabel, monthLabel } from '@/lib/format';
import { getContext } from '@/lib/session';
import type { TransactionItem, TransactionList } from '@/lib/types';

export const metadata: Metadata = { title: 'Lançamentos' };

const FILTERS = [
  ['todos', 'Todos'],
  ['despesas', 'Despesas'],
  ['receitas', 'Receitas'],
  ['pendentes', 'Pendentes'],
] as const;

type Filter = (typeof FILTERS)[number][0];

function applyFilter(items: TransactionItem[], filter: Filter, meId: string, mine: boolean) {
  return items.filter(
    (i) =>
      (filter === 'todos' ||
        (filter === 'despesas' && i.kind === 'expense') ||
        (filter === 'receitas' && i.kind === 'income') ||
        (filter === 'pendentes' && i.status === 'pending' && !i.card && (i.kind === 'income' || i.kind === 'expense'))) &&
      (!mine || i.createdBy.id === meId),
  );
}

const daySpent = (list: TransactionItem[]) => list.filter((t) => t.kind === 'expense' && !t.ignored).reduce((s, t) => s + t.amount, 0);

const pendingTotal = (list: TransactionItem[]) =>
  list.filter((t) => t.kind === 'expense' && t.status === 'pending' && !t.card && !t.ignored).reduce((s, t) => s + t.amount, 0);

function itemHref(t: TransactionItem, month: string) {
  if (t.card && t.invoice) return `/cartoes/compras/${t.id}?fatura=${t.invoice.month}`;
  if (t.transfer) return `/transferencias/${t.transfer.id}?mes=${month}`;
  if (t.kind === 'invoice_payment' && t.invoice) return `/cartoes/${t.invoice.cardId}?mes=${t.invoice.month}`;
  return `/lancamentos/${t.id}?mes=${month}`;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string; filtro?: string; meus?: string; desfazer?: string }> }) {
  const sp = await searchParams;
  const today = todayIn('America/Sao_Paulo');
  const month = sp.mes && isValidMonth(sp.mes) ? sp.mes : today.slice(0, 7);
  const filter = (FILTERS.find(([k]) => k === sp.filtro)?.[0] ?? 'todos') as Filter;
  const mine = sp.meus === '1';
  const here = `/lancamentos?mes=${month}`;

  const ctx = await getContext(here);
  const data = await api<TransactionList>(`/workspaces/${ctx.active.id}/transactions?month=${month}`, { returnTo: here });
  const shared = ctx.active.type === 'shared';
  const canWrite = ctx.active.role === 'owner' || ctx.active.role === 'editor';
  const items = applyFilter(data.items, filter, ctx.me.id, mine);

  const days = new Map<string, TransactionItem[]>();
  for (const item of items) days.set(item.date, [...(days.get(item.date) ?? []), item]);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ mes: month, filtro: filter, ...(mine ? { meus: '1' } : {}) });
    for (const [k, v] of Object.entries(patch)) (v === undefined ? p.delete(k) : p.set(k, v));
    return `/lancamentos?${p.toString()}`;
  };

  return (
    <AppShell {...ctx} current="/lancamentos">
      <h1 className="text-[20px] font-semibold">Lançamentos</h1>

      {sp.desfazer ? (
        <form action={restoreTransactionsAction} className="flex items-center justify-between gap-3 rounded-[12px] bg-ink px-4 py-3 text-[15px] text-surface">
          <span>Lançamento excluído.</span>
          <input type="hidden" name="workspaceId" value={ctx.active.id} />
          <input type="hidden" name="ids" value={sp.desfazer} />
          <input type="hidden" name="month" value={month} />
          <button className="font-semibold text-brand-tint underline">Desfazer</button>
        </form>
      ) : null}

      <nav aria-label="Mês" className="flex items-center justify-between">
        <Link href={qs({ mes: shiftMonth(month, -1) })} aria-label="Mês anterior" className="grid size-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <span className="text-[15px] font-semibold">{monthLabel(month)}</span>
        <Link href={qs({ mes: shiftMonth(month, 1) })} aria-label="Próximo mês" className="grid size-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
          <ChevronRight size={20} aria-hidden />
        </Link>
      </nav>

      {pendingTotal(data.items) > 0 ? (
        <Link href={qs({ filtro: 'pendentes' })} className="flex justify-between rounded-[12px] bg-warning-tint px-4 py-2.5 text-[13px] font-semibold text-warning">
          Despesas pendentes no mês
          <span className="num">{formatBRL(pendingTotal(data.items))}</span>
        </Link>
      ) : null}

      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-[12px] bg-surface p-3 text-[13px] text-ink-2">
          Receitas<p className="num text-[15px] font-semibold text-income md:text-[17px]">{formatBRL(data.summary.income)}</p>
        </div>
        <div className="rounded-[12px] bg-surface p-3 text-[13px] text-ink-2">
          Despesas<p className="num text-[15px] font-semibold text-expense md:text-[17px]">{formatBRL(data.summary.expense)}</p>
        </div>
        <div className="rounded-[12px] bg-surface p-3 text-[13px] text-ink-2">
          Resultado<p className={`num text-[15px] font-semibold md:text-[17px] ${data.summary.result < 0 ? 'text-expense' : 'text-ink'}`}>{formatBRL(data.summary.result)}</p>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([key, label]) => (
          <Link
            key={key}
            href={qs({ filtro: key })}
            aria-current={filter === key ? 'true' : undefined}
            className="flex min-h-9 shrink-0 items-center rounded-full border border-border bg-surface px-3.5 text-[13px] font-semibold aria-[current=true]:border-brand aria-[current=true]:bg-brand-tint aria-[current=true]:text-brand-strong"
          >
            {label}
          </Link>
        ))}
        {shared ? (
          <Link
            href={qs({ meus: mine ? undefined : '1' })}
            aria-current={mine ? 'true' : undefined}
            className="flex min-h-9 shrink-0 items-center rounded-full border border-border bg-surface px-3.5 text-[13px] font-semibold aria-[current=true]:border-brand aria-[current=true]:bg-brand-tint aria-[current=true]:text-brand-strong"
          >
            Só meus
          </Link>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="rounded-[12px] bg-surface p-6 text-center text-[15px] text-ink-2">
          {data.items.length === 0 ? 'Nenhum lançamento neste mês.' : 'Nada neste filtro.'}
          {canWrite && data.items.length === 0 ? (
            <>
              {' '}
              <Link href={`/lancamentos/novo?mes=${month}`} className="font-semibold text-brand">Lançar agora</Link>
            </>
          ) : null}
        </p>
      ) : (
        [...days.entries()].map(([date, list]) => (
          <section key={date} aria-label={date}>
            <h2 className="flex justify-between px-1 pb-1.5 text-[12px] font-semibold tracking-[0.4px] text-ink-2">
              {dayLabel(date, today)}
              {daySpent(list) > 0 ? <span className="num font-normal normal-case tracking-normal">gasto no dia {formatBRL(daySpent(list))}</span> : null}
            </h2>
            <ul className="overflow-hidden rounded-[12px] bg-surface">
              {list.map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
                  <Link href={itemHref(t, month)} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-semibold text-ink-2" aria-hidden>
                      {t.transfer ? '⇄' : (t.category?.name ?? t.description).slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[15px] ${t.ignored ? 'text-ink-3 line-through' : ''}`}>
                        {t.description}
                        {t.series?.type === 'installment' ? ` ${t.series.number}/${t.series.total}` : ''}
                      </span>
                      <span className="block truncate text-[13px] text-ink-2">
                        {[
                          t.transfer ? `${t.account?.name ?? ''} → ${t.transfer.to?.name ?? ''}` : t.kind === 'invoice_payment' ? 'Pagamento de fatura' : t.ignored ? 'Ignorado' : t.category?.name ?? 'Sem categoria',
                          t.transfer ? null : t.card ? t.card.name : t.account?.name,
                          shared ? t.createdBy.name.split(' ')[0] : null, t.series?.type === 'recurring' ? 'Todo mês' : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className={`num shrink-0 text-[15px] font-semibold ${t.ignored ? 'text-ink-3 line-through' : t.kind === 'income' ? 'text-income' : t.kind === 'invoice_payment' || t.transfer ? 'text-ink' : 'text-expense'}`}>
                      {t.transfer ? '' : t.kind === 'income' ? '+ ' : '− '}
                      {formatBRL(t.amount)}
                    </span>
                  </Link>
                  {t.card ? (
                    <span className="h-8 shrink-0 rounded-full bg-surface-2 px-2.5 text-[12px] font-semibold leading-8 text-ink-2">Cartão</span>
                  ) : t.transfer ? (
                    <span className={`h-8 shrink-0 rounded-full px-2.5 text-[12px] font-semibold leading-8 ${t.status === 'paid' ? 'bg-income-tint text-income' : 'bg-warning-tint text-warning'}`}>
                      {t.status === 'paid' ? 'Feita' : 'Agendada'}
                    </span>
                  ) : t.kind === 'invoice_payment' ? (
                    <span className="h-8 shrink-0 rounded-full bg-income-tint px-2.5 text-[12px] font-semibold leading-8 text-income">Pago</span>
                  ) : canWrite ? (
                    <form action={togglePaidAction}>
                      <input type="hidden" name="workspaceId" value={ctx.active.id} />
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="paid" value={t.status === 'paid' ? '0' : '1'} />
                      <button
                        aria-label={t.status === 'paid' ? `Marcar ${t.description} como pendente` : `Marcar ${t.description} como ${t.kind === 'income' ? 'recebido' : 'pago'}`}
                        className={`h-8 rounded-full px-2.5 text-[12px] font-semibold ${
                          t.status === 'paid'
                            ? 'bg-income-tint text-income'
                            : date < today
                              ? 'bg-expense-tint text-expense'
                              : 'bg-warning-tint text-warning'
                        }`}
                      >
                        {t.status === 'paid' ? (t.kind === 'income' ? 'Recebido' : 'Pago') : date < today ? 'Vencido' : 'Pendente'}
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </AppShell>
  );
}
