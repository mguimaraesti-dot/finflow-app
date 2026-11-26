import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { todayIn } from '@finflow/shared';
import { deleteTransactionAction, togglePaidAction } from '@/app/transaction-actions';
import { AppShell } from '@/components/app-shell';
import { TransactionForm } from '@/components/transaction-form';
import { api, ApiError } from '@/lib/api';
import { getContext } from '@/lib/session';
import type { AccountSummary, Category, TransactionItem } from '@/lib/types';

export const metadata: Metadata = { title: 'Editar lançamento' };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const here = `/lancamentos/${id}`;
  const ctx = await getContext(here);
  let tx: TransactionItem;
  try {
    tx = await api<TransactionItem>(`/workspaces/${ctx.active.id}/transactions/${id}`, { returnTo: here });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const [accounts, categories] = await Promise.all([
    api<AccountSummary[]>(`/workspaces/${ctx.active.id}/accounts`, { returnTo: here }),
    api<Category[]>(`/workspaces/${ctx.active.id}/categories`, { returnTo: here }),
  ]);
  const month = sp.mes ?? tx.date.slice(0, 7);
  const canWrite = ctx.active.role === 'owner' || ctx.active.role === 'editor';
  const paidWord = tx.kind === 'income' ? 'recebido' : 'pago';

  return (
    <AppShell {...ctx} current="/lancamentos">
      <h1 className="text-[20px] font-semibold">Editar lançamento</h1>
      <p className="text-[13px] text-ink-2">
        Lançado por {tx.createdBy.name}. {tx.status === 'paid' ? `Marcado como ${paidWord} em ${tx.paidAt?.split('-').reverse().join('/')}.` : 'Ainda pendente.'}
      </p>

      {canWrite ? (
        <>
          <TransactionForm
            workspaceId={ctx.active.id}
            accounts={accounts}
            categories={categories}
            today={todayIn('America/Sao_Paulo')}
            existing={tx}
            cancelHref={`/lancamentos?mes=${month}`}
          />

          <form action={togglePaidAction} className="flex items-center justify-between rounded-[12px] bg-surface p-4">
            <span className="text-[15px]">{tx.status === 'paid' ? `Está ${paidWord}` : `Ainda não foi ${paidWord}`}</span>
            <input type="hidden" name="workspaceId" value={ctx.active.id} />
            <input type="hidden" name="id" value={tx.id} />
            <input type="hidden" name="paid" value={tx.status === 'paid' ? '0' : '1'} />
            <button className="h-11 rounded-[12px] border border-border px-4 text-[15px] font-semibold text-brand">
              {tx.status === 'paid' ? 'Marcar como pendente' : `Marcar como ${paidWord}`}
            </button>
          </form>

          <section className="flex flex-col gap-2 rounded-[12px] bg-surface p-4">
            <h2 className="text-[15px] font-semibold">Excluir</h2>
            <div className="flex flex-wrap gap-2">
              <form action={deleteTransactionAction}>
                <input type="hidden" name="workspaceId" value={ctx.active.id} />
                <input type="hidden" name="id" value={tx.id} />
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="scope" value="this" />
                <button className="h-11 rounded-[12px] border border-border px-4 text-[15px] font-semibold text-expense">
                  {tx.series ? 'Só este mês' : 'Excluir lançamento'}
                </button>
              </form>
              {tx.series ? (
                <form action={deleteTransactionAction}>
                  <input type="hidden" name="workspaceId" value={ctx.active.id} />
                  <input type="hidden" name="id" value={tx.id} />
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="scope" value="future" />
                  <button className="h-11 rounded-[12px] border border-border px-4 text-[15px] font-semibold text-expense">Este e os próximos</button>
                </form>
              ) : null}
            </div>
            <p className="text-[13px] text-ink-2">Você pode desfazer logo depois de excluir.</p>
          </section>
        </>
      ) : (
        <p className="rounded-[12px] bg-surface p-4 text-[15px]">Você tem acesso só de leitura neste espaço.</p>
      )}
    </AppShell>
  );
}
