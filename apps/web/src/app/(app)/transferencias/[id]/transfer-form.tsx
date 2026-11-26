'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { updateTransferAction } from '@/app/transfer-actions';
import { MoneyInput } from '@/components/money-input';
import { FormMessage, SubmitButton } from '@/components/ui';
import type { AccountSummary, Transfer } from '@/lib/types';

const inputCls = 'h-12 w-full rounded-[8px] border border-ink-3 bg-surface px-3 text-[15px] text-ink';
const labelCls = 'text-[13px] font-semibold';

export function TransferForm({ workspaceId, transfer, accounts, cancelHref }: { workspaceId: string; transfer: Transfer; accounts: AccountSummary[]; cancelHref: string }) {
  const [state, action] = useActionState(updateTransferAction, null);
  const f = state?.fields ?? {};
  // A conta pode ter sido arquivada: continua na lista para não sumir da tela.
  const options = [...accounts, ...[transfer.from, transfer.to].filter((a) => !accounts.some((x) => x.id === a.id))];
  return (
    <form action={action} className="flex flex-col gap-4 rounded-[20px] bg-surface p-4 md:p-6">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="id" value={transfer.id} />
      <MoneyInput name="amount" defaultCents={transfer.amount} error={f.amount} />
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="f-from" className={labelCls}>Sai da conta</label>
          <select id="f-from" name="fromAccountId" defaultValue={transfer.from.id} className={inputCls}>
            {options.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-to" className={labelCls}>Entra na conta</label>
          <select id="f-to" name="toAccountId" defaultValue={transfer.to.id} className={inputCls} aria-invalid={Boolean(f.toAccountId)}>
            {options.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {f.toAccountId ? <span className="text-[13px] text-expense">{f.toAccountId}</span> : null}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-date" className={labelCls}>Data</label>
          <input id="f-date" name="date" type="date" defaultValue={transfer.date} required className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-desc" className={labelCls}>Descrição</label>
          <input id="f-desc" name="description" defaultValue={transfer.description} maxLength={120} className={inputCls} />
        </div>
      </div>
      <label className="flex min-h-12 items-center justify-between border-t border-border pt-3 text-[15px]">
        Já foi feita
        <input type="checkbox" name="paid" defaultChecked={transfer.paid} className="size-5 accent-[var(--brand)]" />
      </label>
      <div className="flex flex-col gap-1">
        <label htmlFor="f-notes" className={labelCls}>Observação</label>
        <textarea id="f-notes" name="notes" defaultValue={transfer.notes ?? ''} maxLength={500} rows={2} className="rounded-[8px] border border-ink-3 bg-surface px-3 py-2 text-[15px]" />
      </div>
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Link href={cancelHref} className="grid h-12 place-items-center rounded-[12px] px-4 text-[15px] font-semibold text-brand">Cancelar</Link>
        <SubmitButton>Salvar alterações</SubmitButton>
      </div>
    </form>
  );
}
