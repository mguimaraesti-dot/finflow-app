import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatBRL, isValidMonth } from '@finflow/shared';
import { deletePurchaseAction } from '@/app/card-actions';
import { AppShell } from '@/components/app-shell';
import { shortDate } from '@/components/invoice-status';
import { api, ApiError } from '@/lib/api';
import { getContext } from '@/lib/session';
import type { CardPurchase, Category } from '@/lib/types';
import { PurchaseForm } from './purchase-form';

export const metadata: Metadata = { title: 'Compra no cartão' };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fatura?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const here = `/cartoes/compras/${id}`;
  const ctx = await getContext(here);
  let purchase: CardPurchase;
  try {
    purchase = await api<CardPurchase>(`/workspaces/${ctx.active.id}/purchases/${id}`, { returnTo: here });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const categories = await api<Category[]>(`/workspaces/${ctx.active.id}/categories`, { returnTo: here });
  const back = sp.fatura && isValidMonth(sp.fatura) ? sp.fatura : '';
  const canWrite = ctx.active.role === 'owner' || ctx.active.role === 'editor';

  return (
    <AppShell {...ctx} current="/cartoes">
      <h1 className="text-[20px] font-semibold">
        {purchase.kind === 'income' ? 'Estorno' : 'Compra'} no {purchase.card.name}
      </h1>
      {canWrite ? (
        <>
          <PurchaseForm workspaceId={ctx.active.id} purchase={purchase} categories={categories} back={back} />
          <section className="flex flex-col gap-2 rounded-[12px] bg-surface p-4">
            <h2 className="text-[15px] font-semibold">Excluir</h2>
            <form action={deletePurchaseAction}>
              <input type="hidden" name="workspaceId" value={ctx.active.id} />
              <input type="hidden" name="id" value={purchase.id} />
              <input type="hidden" name="cardId" value={purchase.card.id} />
              <input type="hidden" name="back" value={back} />
              <button className="h-11 rounded-[12px] border border-border px-4 text-[15px] font-semibold text-expense">
                {purchase.installments > 1 ? `Excluir compra e as ${purchase.installments} parcelas` : 'Excluir compra'}
              </button>
            </form>
            <p className="text-[13px] text-ink-2">Você pode desfazer logo depois de excluir.</p>
          </section>
        </>
      ) : (
        <section className="rounded-[12px] bg-surface p-4 text-[15px]">
          <p>{purchase.description}</p>
          <p className="num font-semibold">{formatBRL(purchase.amount)}</p>
          <p className="text-[13px] text-ink-2">
            {shortDate(purchase.date)} · {purchase.installments > 1 ? `${purchase.installments}x` : 'à vista'} · acesso só de leitura
          </p>
        </section>
      )}
    </AppShell>
  );
}
