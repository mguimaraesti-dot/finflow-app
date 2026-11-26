import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { formatBRL, isValidMonth, todayIn } from '@finflow/shared';
import { archiveCardAction, removePaymentAction, restorePurchaseAction } from '@/app/card-actions';
import { AppShell } from '@/components/app-shell';
import { CardForm } from '@/components/card-form';
import { InvoiceStatusChip, shortDate } from '@/components/invoice-status';
import { api, ApiError } from '@/lib/api';
import { monthLabel } from '@/lib/format';
import { getContext } from '@/lib/session';
import type { AccountSummary, InvoiceView } from '@/lib/types';
import { PayInvoiceForm } from './pay-form';

export const metadata: Metadata = { title: 'Fatura' };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string; desfazer?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const month = sp.mes && isValidMonth(sp.mes) ? sp.mes : undefined;
  const here = `/cartoes/${id}${month ? `?mes=${month}` : ''}`;
  const ctx = await getContext(here);
  let data: InvoiceView;
  try {
    data = await api<InvoiceView>(`/workspaces/${ctx.active.id}/cards/${id}/invoice${month ? `?month=${month}` : ''}`, { returnTo: here });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const accounts = await api<AccountSummary[]>(`/workspaces/${ctx.active.id}/accounts`, { returnTo: here });
  const { card, invoice } = data;
  const today = todayIn('America/Sao_Paulo');
  const canWrite = (ctx.active.role === 'owner' || ctx.active.role === 'editor') && !card.archived;
  const hidden = (fields: Record<string, string>) =>
    Object.entries({ workspaceId: ctx.active.id, cardId: card.id, back: invoice.month, ...fields }).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  return (
    <AppShell {...ctx} current="/cartoes">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[20px] font-semibold">{card.name}</h1>
        {canWrite ? (
          <Link href={`/lancamentos/novo?cartao=${card.id}`} className="flex h-10 items-center gap-1.5 rounded-[12px] border border-border bg-surface px-3 text-[13px] font-semibold text-brand">
            <Plus size={16} aria-hidden /> Nova compra
          </Link>
        ) : null}
      </div>
      {card.archived ? <p className="rounded-[12px] bg-surface-2 p-3 text-[13px] text-ink-2">Cartão arquivado: só consulta.</p> : null}

      {sp.desfazer ? (
        <form action={restorePurchaseAction} className="flex items-center justify-between gap-3 rounded-[12px] bg-ink px-4 py-3 text-[15px] text-surface">
          <span>Compra excluída.</span>
          {hidden({ ids: sp.desfazer })}
          <button className="font-semibold text-brand-tint underline">Desfazer</button>
        </form>
      ) : null}

      <nav aria-label="Fatura" className="flex items-center justify-between">
        <Link href={`/cartoes/${card.id}?mes=${data.prev}`} aria-label="Fatura anterior" className="grid size-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <span className="text-[15px] font-semibold">Fatura de {monthLabel(invoice.month).toLowerCase()}</span>
        <Link href={`/cartoes/${card.id}?mes=${data.next}`} aria-label="Próxima fatura" className="grid size-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
          <ChevronRight size={20} aria-hidden />
        </Link>
      </nav>

      <section className="flex flex-col gap-3 rounded-[20px] bg-surface p-4">
        <div className="flex items-center justify-between">
          <InvoiceStatusChip status={invoice.status} />
          <span className="text-[13px] text-ink-2">
            Fecha {shortDate(invoice.closingDate)} · vence {shortDate(invoice.dueDate)}
          </span>
        </div>
        <p className="num text-[32px] font-semibold leading-[38px] tracking-[-0.5px]">{formatBRL(invoice.total)}</p>
        {invoice.paid > 0 ? (
          <p className="flex justify-between border-t border-border pt-3 text-[13px] text-ink-2">
            Pago <span className="num font-semibold text-income">{formatBRL(invoice.paid)}</span>
          </p>
        ) : null}
        {invoice.paid > 0 && invoice.remaining > 0 ? (
          <p className="flex justify-between text-[13px] text-ink-2">
            Falta pagar <span className="num font-semibold text-ink">{formatBRL(invoice.remaining)}</span>
          </p>
        ) : null}
      </section>

      {canWrite && invoice.remaining > 0 && accounts.length > 0 ? (
        <details className="rounded-[12px] bg-surface p-4" open={invoice.status === 'closed' || invoice.status === 'overdue'}>
          <summary className="cursor-pointer text-[15px] font-semibold text-brand">Pagar fatura</summary>
          <div className="mt-4">
            <PayInvoiceForm
              workspaceId={ctx.active.id}
              cardId={card.id}
              month={invoice.month}
              remaining={invoice.remaining}
              accounts={accounts}
              defaultAccountId={card.paymentAccount.id}
              today={today}
            />
          </div>
        </details>
      ) : null}

      {data.payments.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[16px] font-semibold">Pagamentos</h2>
          <ul className="overflow-hidden rounded-[12px] bg-surface">
            {data.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 first:border-t-0">
                <span className="text-[15px]">
                  {shortDate(p.date)}
                  <span className="block text-[13px] text-ink-2">{p.account?.name}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="num text-[15px] font-semibold text-income">{formatBRL(p.amount)}</span>
                  {canWrite ? (
                    <form action={removePaymentAction}>
                      {hidden({ paymentId: p.id })}
                      <button className="h-8 rounded-full border border-border px-2.5 text-[12px] font-semibold text-expense" aria-label={`Desfazer pagamento de ${formatBRL(p.amount)}`}>
                        Desfazer
                      </button>
                    </form>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-[16px] font-semibold">Compras</h2>
        {data.items.length === 0 ? (
          <p className="rounded-[12px] bg-surface p-4 text-[15px] text-ink-2">Nenhuma compra nesta fatura.</p>
        ) : (
          <ul className="overflow-hidden rounded-[12px] bg-surface">
            {data.items.map((t) => (
              <li key={t.id} className="border-t border-border first:border-t-0">
                <Link href={`/cartoes/compras/${t.id}?fatura=${invoice.month}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">
                      {t.description}
                      {t.installment ? ` ${t.installment.number}/${t.installment.total}` : ''}
                    </span>
                    <span className="block truncate text-[13px] text-ink-2">{[t.category?.name ?? 'Sem categoria', shortDate(t.date)].join(' · ')}</span>
                  </span>
                  <span className={`num shrink-0 text-[15px] font-semibold ${t.kind === 'income' ? 'text-income' : 'text-ink'}`}>
                    {t.kind === 'income' ? '− ' : ''}
                    {formatBRL(t.amount)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canWrite ? (
        <details className="rounded-[12px] bg-surface p-4">
          <summary className="cursor-pointer text-[15px] font-semibold text-brand">Configurar cartão</summary>
          <div className="mt-4 flex flex-col gap-4">
            <CardForm workspaceId={ctx.active.id} accounts={accounts} existing={card} />
            <form action={archiveCardAction} className="border-t border-border pt-4">
              <input type="hidden" name="workspaceId" value={ctx.active.id} />
              <input type="hidden" name="id" value={card.id} />
              <button className="h-11 rounded-[12px] border border-border px-4 text-[15px] font-semibold text-expense">Arquivar cartão</button>
              <p className="mt-1 text-[13px] text-ink-2">Some da lista e não recebe novas compras. O histórico continua nos lançamentos.</p>
            </form>
          </div>
        </details>
      ) : null}
    </AppShell>
  );
}
