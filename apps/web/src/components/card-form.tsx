'use client';

import { CARD_BRAND_LABELS, CARD_BRANDS } from '@finflow/shared';
import { useActionState, useState } from 'react';
import { createCardAction, updateCardAction } from '@/app/card-actions';
import { Field, FormMessage, SubmitButton } from '@/components/ui';
import type { AccountSummary, CardBase } from '@/lib/types';
import { MoneyInput } from './money-input';

const inputCls = 'h-12 w-full rounded-[8px] border border-ink-3 bg-surface px-3 text-[15px]';
const labelCls = 'text-[13px] font-semibold';

export function CardForm({ workspaceId, accounts, existing }: { workspaceId: string; accounts: AccountSummary[]; existing?: CardBase }) {
  const [state, action] = useActionState(existing ? updateCardAction : createCardAction, null);
  const [closingDay, setClosingDay] = useState(existing?.closingDay ?? 0);
  const f = state?.fields ?? {};

  if (accounts.length === 0) {
    return <p className="text-[15px] text-ink-2">Cadastre antes uma conta no Início: é dela que sai o pagamento da fatura.</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {existing ? <input type="hidden" name="id" value={existing.id} /> : null}
      <Field label="Nome" name="name" placeholder="Nubank" defaultValue={existing?.name} error={f.name} />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="f-brand" className={labelCls}>Bandeira</label>
          <select id="f-brand" name="brand" defaultValue={existing?.brand ?? 'mastercard'} className={inputCls}>
            {CARD_BRANDS.map((b) => (
              <option key={b} value={b}>{CARD_BRAND_LABELS[b]}</option>
            ))}
          </select>
        </div>
        <MoneyInput name="limit" label="Limite" size="md" defaultCents={existing?.limit ?? 0} error={f.limit} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="f-closing" className={labelCls}>Dia do fechamento</label>
          <input
            id="f-closing"
            name="closingDay"
            type="number"
            min={1}
            max={31}
            required
            defaultValue={existing?.closingDay}
            onChange={(e) => setClosingDay(Number(e.target.value))}
            className={inputCls}
            aria-invalid={Boolean(f.closingDay)}
          />
          {f.closingDay ? <span className="text-[13px] text-expense">{f.closingDay}</span> : null}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-due" className={labelCls}>Dia do vencimento</label>
          <input id="f-due" name="dueDay" type="number" min={1} max={31} required defaultValue={existing?.dueDay} className={inputCls} aria-invalid={Boolean(f.dueDay)} />
          {f.dueDay ? <span className="text-[13px] text-expense">{f.dueDay}</span> : null}
        </div>
      </div>
      {closingDay >= 1 && closingDay <= 31 ? (
        <p className="text-[13px] text-ink-2">Melhor dia de compra: dia {closingDay}. O que você comprar a partir dele já vai para a fatura seguinte.</p>
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="f-payacc" className={labelCls}>Conta que paga a fatura</label>
        <select id="f-payacc" name="paymentAccountId" defaultValue={existing?.paymentAccount.id ?? accounts[0]?.id} className={inputCls}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      {existing ? (
        <p className="text-[13px] text-ink-2">Mudar os dias vale para as próximas faturas; as que já existem mantêm as datas.</p>
      ) : null}
      <SubmitButton>{existing ? 'Salvar cartão' : 'Adicionar cartão'}</SubmitButton>
    </form>
  );
}
