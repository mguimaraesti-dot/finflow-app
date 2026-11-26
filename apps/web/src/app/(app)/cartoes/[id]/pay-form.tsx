'use client';

import { useActionState, useMemo } from 'react';
import { payInvoiceAction } from '@/app/card-actions';
import { FormMessage, SubmitButton } from '@/components/ui';
import { MoneyInput } from '@/components/money-input';
import type { AccountSummary } from '@/lib/types';

const inputCls = 'h-12 w-full rounded-[8px] border border-ink-3 bg-surface px-3 text-[15px]';

export function PayInvoiceForm({
  workspaceId,
  cardId,
  month,
  remaining,
  accounts,
  defaultAccountId,
  today,
}: {
  workspaceId: string;
  cardId: string;
  month: string;
  remaining: number;
  accounts: AccountSummary[];
  defaultAccountId: string;
  today: string;
}) {
  const [state, action] = useActionState(payInvoiceAction, null);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [state]);
  const f = state?.fields ?? {};
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="cardId" value={cardId} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <MoneyInput key={remaining} name="amount" label="Quanto vai pagar" size="md" defaultCents={remaining} error={f.amount} />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="f-payacc" className="text-[13px] font-semibold">Sai da conta</label>
          <select id="f-payacc" name="accountId" defaultValue={defaultAccountId} className={inputCls}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-paydate" className="text-[13px] font-semibold">Data do pagamento</label>
          <input id="f-paydate" name="date" type="date" defaultValue={today} required className={inputCls} />
        </div>
      </div>
      <p className="text-[13px] text-ink-2">Pode pagar só uma parte: o restante continua em aberto nesta fatura.</p>
      <SubmitButton>Registrar pagamento</SubmitButton>
    </form>
  );
}
