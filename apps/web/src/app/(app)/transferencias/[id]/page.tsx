import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatBRL, isValidMonth } from '@finflow/shared';
import { deleteTransferAction } from '@/app/transfer-actions';
import { AppShell } from '@/components/app-shell';
import { api, ApiError } from '@/lib/api';
import { getContext } from '@/lib/session';
import type { AccountSummary, Transfer } from '@/lib/types';
import { TransferForm } from './transfer-form';

export const metadata: Metadata = { title: 'Transferência' };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const here = `/transferencias/${id}`;
  const ctx = await getContext(here);
  let transfer: Transfer;
  try {
    transfer = await api<Transfer>(`/workspaces/${ctx.active.id}/transfers/${id}`, { returnTo: here });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const accounts = await api<AccountSummary[]>(`/workspaces/${ctx.active.id}/accounts`, { returnTo: here });
  const month = sp.mes && isValidMonth(sp.mes) ? sp.mes : transfer.date.slice(0, 7);
  const canWrite = ctx.active.role === 'owner' || ctx.active.role === 'editor';

  return (
    <AppShell {...ctx} current="/lancamentos">
      <h1 className="text-[20px] font-semibold">Transferência</h1>
      {canWrite ? (
        <>
          <TransferForm workspaceId={ctx.active.id} transfer={transfer} accounts={accounts} cancelHref={`/lancamentos?mes=${month}`} />
          <section className="flex flex-col gap-2 rounded-[12px] bg-surface p-4">
            <h2 className="text-[15px] font-semibold">Excluir</h2>
            <form action={deleteTransferAction}>
              <input type="hidden" name="workspaceId" value={ctx.active.id} />
              <input type="hidden" name="id" value={transfer.id} />
              <input type="hidden" name="month" value={month} />
              <button className="h-11 rounded-[12px] border border-border px-4 text-[15px] font-semibold text-expense">Excluir transferência</button>
            </form>
            <p className="text-[13px] text-ink-2">Some das duas contas. Você pode desfazer logo depois.</p>
          </section>
        </>
      ) : (
        <p className="rounded-[12px] bg-surface p-4 text-[15px]">
          {transfer.from.name} → {transfer.to.name}: <span className="num font-semibold">{formatBRL(transfer.amount)}</span>. Acesso só de leitura.
        </p>
      )}
    </AppShell>
  );
}
