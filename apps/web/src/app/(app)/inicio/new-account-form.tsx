'use client';

import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES } from '@finflow/shared';
import { useActionState } from 'react';
import { createAccountAction } from '@/app/actions';
import { Field, FormMessage, SubmitButton } from '@/components/ui';

export function NewAccountForm({ workspaceId }: { workspaceId: string }) {
  const [state, action] = useActionState(createAccountAction, null);
  return (
    <details className="rounded-[12px] bg-surface p-4">
      <summary className="cursor-pointer text-[15px] font-semibold text-brand">Nova conta</summary>
      <form action={action} className="mt-4 flex flex-col gap-3">
        <FormMessage state={state} />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <Field label="Nome" name="name" placeholder="Conta Itaú" error={state?.fields?.name} />
        <div className="flex flex-col gap-1">
          <label htmlFor="f-type" className="text-[13px] font-semibold">Tipo</label>
          <select id="f-type" name="type" className="h-12 rounded-[8px] border border-ink-3 bg-surface px-3 text-[15px]">
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <Field label="Saldo atual (R$)" name="initialBalance" inputMode="decimal" placeholder="0,00" required={false} error={state?.fields?.initialBalance} />
        <SubmitButton>Salvar conta</SubmitButton>
      </form>
    </details>
  );
}
