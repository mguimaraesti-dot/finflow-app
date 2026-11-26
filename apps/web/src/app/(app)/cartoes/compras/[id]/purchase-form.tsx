'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { MAX_CARD_INSTALLMENTS } from '@finflow/shared';
import { updatePurchaseAction } from '@/app/card-actions';
import { MoneyInput } from '@/components/money-input';
import { FormMessage, SubmitButton } from '@/components/ui';
import type { CardPurchase, Category } from '@/lib/types';

const inputCls = 'h-12 w-full rounded-[8px] border border-ink-3 bg-surface px-3 text-[15px] text-ink';
const labelCls = 'text-[13px] font-semibold';

export function PurchaseForm({
  workspaceId,
  purchase,
  categories,
  back,
}: {
  workspaceId: string;
  purchase: CardPurchase;
  categories: Category[];
  back: string;
}) {
  const [state, action] = useActionState(updatePurchaseAction, null);
  const f = state?.fields ?? {};
  const cats = categories.filter((c) => c.kind === purchase.kind);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-[20px] bg-surface p-4 md:p-6">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="id" value={purchase.id} />
      <input type="hidden" name="cardId" value={purchase.card.id} />
      <input type="hidden" name="back" value={back} />
      <MoneyInput name="amount" label="Valor total" defaultCents={purchase.amount} tone={purchase.kind} error={f.amount} />
      <FormMessage state={state} />
      <div className="flex flex-col gap-1">
        <label htmlFor="f-description" className={labelCls}>Descrição</label>
        <input id="f-description" name="description" defaultValue={purchase.description} required maxLength={120} className={inputCls} />
        {f.description ? <span className="text-[13px] text-expense">{f.description}</span> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="f-date" className={labelCls}>Data da compra</label>
          <input id="f-date" name="date" type="date" defaultValue={purchase.date} required className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-installments" className={labelCls}>Parcelas</label>
          <select id="f-installments" name="installments" defaultValue={String(purchase.installments)} className={inputCls}>
            {Array.from({ length: MAX_CARD_INSTALLMENTS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x`}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-category" className={labelCls}>Categoria</label>
          <select id="f-category" name="categoryId" defaultValue={purchase.category?.id ?? ''} className={inputCls}>
            <option value="">Sem categoria</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="f-notes" className={labelCls}>Observação</label>
        <textarea id="f-notes" name="notes" defaultValue={purchase.notes ?? ''} maxLength={500} rows={2} className="rounded-[8px] border border-ink-3 bg-surface px-3 py-2 text-[15px]" />
      </div>
      <p className="text-[13px] text-ink-2">As alterações valem para todas as parcelas. Mudar valor, data ou parcelas recalcula em quais faturas elas caem.</p>
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Link href={`/cartoes/${purchase.card.id}?mes=${back}`} className="grid h-12 place-items-center rounded-[12px] px-4 text-[15px] font-semibold text-brand">Cancelar</Link>
        <SubmitButton>Salvar alterações</SubmitButton>
      </div>
    </form>
  );
}
