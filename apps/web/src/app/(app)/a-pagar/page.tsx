import type { Metadata } from 'next';
import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { addDays, formatBRL } from '@finflow/shared';
import { togglePaidAction } from '@/app/transaction-actions';
import { AppShell } from '@/components/app-shell';
import { shortDate } from '@/components/invoice-status';
import { api } from '@/lib/api';
import { getContext } from '@/lib/session';
import type { Bills } from '@/lib/types';

export const metadata: Metadata = { title: 'A pagar e receber' };

const PERIODS = [7, 30, 60] as const;

interface Entry {
  key: string;
  date: string;
  title: string;
  subtitle: string;
  amount: number;
  href: string;
  /** Lançamento que pode ser quitado direto da lista; fatura abre a tela do cartão. */
  payId: string | null;
  isCard: boolean;
}

function groupOf(date: string, today: string) {
  if (date < today) return 'Vencidas';
  if (date === today) return 'Hoje';
  if (date <= addDays(today, 7)) return 'Próximos 7 dias';
  return 'Mais adiante';
}

export default async function Page({ searchParams }: { searchParams: Promise<{ tipo?: string; dias?: string }> }) {
  const sp = await searchParams;
  const receivable = sp.tipo === 'receber';
  const days = PERIODS.find((p) => String(p) === sp.dias) ?? 30;
  const here = `/a-pagar?tipo=${receivable ? 'receber' : 'pagar'}&dias=${days}`;
  const ctx = await getContext(here);
  const data = await api<Bills>(`/workspaces/${ctx.active.id}/bills?days=${days}`, { returnTo: here });
  const canWrite = ctx.active.role === 'owner' || ctx.active.role === 'editor';
  const { today } = data;

  const entries: Entry[] = [
    ...data.items
      .filter((i) => i.kind === (receivable ? 'income' : 'expense'))
      .map((i) => ({
        key: i.id,
        date: i.date,
        title: `${i.description}${i.series?.type === 'installment' ? ` ${i.series.number}/${i.series.total}` : ''}`,
        subtitle: [i.category?.name ?? 'Sem categoria', i.account?.name].filter(Boolean).join(' · '),
        amount: i.amount,
        href: `/lancamentos/${i.id}`,
        payId: i.id,
        isCard: false,
      })),
    ...(receivable
      ? []
      : data.invoices.map((v) => ({
          key: `${v.cardId}-${v.month}`,
          date: v.dueDate,
          title: `Fatura ${v.cardName}`,
          subtitle: 'Cartão de crédito',
          amount: v.remaining,
          href: `/cartoes/${v.cardId}?mes=${v.month}`,
          payId: null,
          isCard: true,
        }))),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const g = groupOf(e.date, today);
    groups.set(g, [...(groups.get(g) ?? []), e]);
  }
  const sum = (list: Entry[]) => list.reduce((s, e) => s + e.amount, 0);
  const overdue = sum(groups.get('Vencidas') ?? []);
  const week = sum([...(groups.get('Hoje') ?? []), ...(groups.get('Próximos 7 dias') ?? [])]);
  const qs = (patch: Record<string, string>) => `/a-pagar?${new URLSearchParams({ tipo: receivable ? 'receber' : 'pagar', dias: String(days), ...patch })}`;
  const tone = receivable ? 'text-income' : 'text-expense';
  const verb = receivable ? 'Receber' : 'Pagar';

  return (
    <AppShell {...ctx} current="/a-pagar">
      <h1 className="text-[20px] font-semibold">A pagar e receber</h1>

      <div role="tablist" aria-label="Tipo" className="grid max-w-[420px] grid-cols-2 gap-[3px] rounded-[8px] bg-surface-2 p-[3px]">
        {[
          ['pagar', 'A pagar'],
          ['receber', 'A receber'],
        ].map(([k, label]) => (
          <Link
            key={k}
            role="tab"
            href={qs({ tipo: k! })}
            aria-selected={(k === 'receber') === receivable}
            className="rounded-[6px] py-2.5 text-center text-[13px] font-semibold text-ink-2 aria-selected:bg-surface aria-selected:text-ink"
          >
            {label}
          </Link>
        ))}
      </div>

      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-[12px] bg-surface p-3 text-[13px] text-ink-2">
          {receivable ? 'Atrasadas' : 'Vencidas'}
          <p className={`num text-[15px] font-semibold md:text-[17px] ${overdue > 0 ? 'text-expense' : 'text-ink'}`}>{formatBRL(overdue)}</p>
        </div>
        <div className="rounded-[12px] bg-surface p-3 text-[13px] text-ink-2">
          Próximos 7 dias<p className={`num text-[15px] font-semibold md:text-[17px] ${tone}`}>{formatBRL(week)}</p>
        </div>
        <div className="rounded-[12px] bg-surface p-3 text-[13px] text-ink-2">
          Total em {days} dias<p className="num text-[15px] font-semibold md:text-[17px]">{formatBRL(sum(entries))}</p>
        </div>
      </section>

      <div className="flex gap-2" aria-label="Período">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={qs({ dias: String(p) })}
            aria-current={p === days ? 'true' : undefined}
            className="flex min-h-9 items-center rounded-full border border-border bg-surface px-3.5 text-[13px] font-semibold aria-[current=true]:border-brand aria-[current=true]:bg-brand-tint aria-[current=true]:text-brand-strong"
          >
            {p} dias
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="rounded-[12px] bg-surface p-6 text-center text-[15px] text-ink-2">
          {receivable ? 'Nada a receber' : 'Nada a pagar'} nos próximos {days} dias.
        </p>
      ) : (
        ['Vencidas', 'Hoje', 'Próximos 7 dias', 'Mais adiante'].map((g) => {
          const list = groups.get(g);
          if (!list) return null;
          return (
            <section key={g} aria-label={g}>
              <h2 className={`flex justify-between px-1 pb-1.5 text-[12px] font-semibold uppercase tracking-[0.4px] ${g === 'Vencidas' ? 'text-expense' : 'text-ink-2'}`}>
                {g === 'Vencidas' && receivable ? 'Atrasadas' : g}
                <span className="num normal-case tracking-normal">{formatBRL(sum(list))}</span>
              </h2>
              <ul className="overflow-hidden rounded-[12px] bg-surface">
                {list.map((e) => (
                  <li key={e.key} className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
                    <Link href={e.href} className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="w-12 shrink-0 text-center">
                        <span className={`num block text-[15px] font-semibold ${e.date < today ? 'text-expense' : ''}`}>{shortDate(e.date)}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate text-[15px]">
                          {e.isCard ? <CreditCard size={16} strokeWidth={1.5} aria-hidden /> : null}
                          {e.title}
                        </span>
                        <span className="block truncate text-[13px] text-ink-2">{e.subtitle}</span>
                      </span>
                      <span className={`num shrink-0 text-[15px] font-semibold ${tone}`}>{formatBRL(e.amount)}</span>
                    </Link>
                    {canWrite ? (
                      e.payId ? (
                        <form action={togglePaidAction}>
                          <input type="hidden" name="workspaceId" value={ctx.active.id} />
                          <input type="hidden" name="id" value={e.payId} />
                          <input type="hidden" name="paid" value="1" />
                          <button aria-label={`${verb} ${e.title}`} className="h-9 rounded-full bg-brand px-3 text-[13px] font-semibold text-on-brand">
                            {verb}
                          </button>
                        </form>
                      ) : (
                        <Link href={e.href} className="grid h-9 place-items-center rounded-full border border-border px-3 text-[13px] font-semibold text-brand">
                          Ver fatura
                        </Link>
                      )
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      <p className="text-[13px] text-ink-2">Ao tocar em {verb.toLowerCase()}, o lançamento é baixado com a data de hoje e o saldo da conta é atualizado.</p>
    </AppShell>
  );
}
