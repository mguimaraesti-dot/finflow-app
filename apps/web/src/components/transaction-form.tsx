'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { createTransactionAction, updateTransactionAction } from '@/app/transaction-actions';
import { FormMessage, SubmitButton } from '@/components/ui';
import type { AccountSummary, Category, TransactionItem } from '@/lib/types';
import { MoneyInput } from './money-input';

type Kind = 'expense' | 'income';

const selectCls = 'h-12 w-full rounded-[8px] border border-ink-3 bg-surface px-3 text-[15px] text-ink';
const labelCls = 'text-[13px] font-semibold';

export function TransactionForm({
  workspaceId,
  accounts,
  categories,
  today,
  existing,
  cancelHref,
}: {
  workspaceId: string;
  accounts: AccountSummary[];
  categories: Category[];
  today: string;
  existing?: TransactionItem;
  cancelHref: string;
}) {
  const editing = Boolean(existing);
  const [state, action] = useActionState(editing ? updateTransactionAction : createTransactionAction, null);
  const [kind, setKind] = useState<Kind>(existing?.kind ?? 'expense');
  const [date, setDate] = useState(existing?.date ?? today);
  const [repeat, setRepeat] = useState<'none' | 'installment' | 'monthly'>('none');
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [state]);
  const cats = categories.filter((c) => c.kind === kind);
  const f = state?.fields ?? {};
  const yesterday = useMemo(() => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [today]);

  if (accounts.length === 0) {
    return (
      <p className="rounded-[20px] bg-surface p-6 text-[15px]">
        Antes de lançar, cadastre uma conta no <Link href="/inicio" className="font-semibold text-brand">Início</Link>.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4 rounded-[20px] bg-surface p-4 md:p-6">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {existing ? <input type="hidden" name="id" value={existing.id} /> : null}
      <input type="hidden" name="kind" value={kind} />

      {!editing ? (
        <div role="group" aria-label="Tipo" className="grid grid-cols-2 gap-[3px] rounded-[8px] bg-surface-2 p-[3px]">
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className="rounded-[6px] py-2.5 text-[13px] font-semibold text-ink-2 aria-pressed:bg-surface aria-pressed:text-ink"
            >
              {k === 'expense' ? 'Despesa' : 'Receita'}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[13px] font-semibold text-ink-2">{kind === 'expense' ? 'Despesa' : 'Receita'}</p>
      )}

      <MoneyInput key={state?.ok ? idempotencyKey : "valor"} name="amount" defaultCents={existing?.amount ?? 0} tone={kind} error={f.amount} autoFocus={!editing} />
      <FormMessage state={state} />

      <div className="flex flex-col gap-1">
        <label htmlFor="f-description" className={labelCls}>Descrição</label>
        <input id="f-description" name="description" defaultValue={existing?.description} required maxLength={120} placeholder={kind === 'expense' ? 'Mercado do bairro' : 'Salário'} className={selectCls} aria-invalid={Boolean(f.description)} />
        {f.description ? <span className="text-[13px] text-expense">{f.description}</span> : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className={labelCls}>Data</span>
        <div className="flex flex-wrap gap-2">
          {[
            ['Hoje', today],
            ['Ontem', yesterday],
          ].map(([label, value]) => (
            <button
              key={label}
              type="button"
              aria-pressed={date === value}
              onClick={() => setDate(value!)}
              className="min-h-9 rounded-full border border-border px-3.5 text-[13px] font-semibold aria-pressed:border-brand aria-pressed:bg-brand-tint aria-pressed:text-brand-strong"
            >
              {label}
            </button>
          ))}
          <input type="date" name="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Outra data" className="h-9 rounded-full border border-border bg-surface px-3 text-[13px]" required />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="f-category" className={labelCls}>Categoria</label>
          <select id="f-category" name="categoryId" key={kind} defaultValue={existing?.category?.id ?? ''} className={selectCls}>
            <option value="">Sem categoria</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-account" className={labelCls}>Conta</label>
          <select id="f-account" name="accountId" defaultValue={existing?.account?.id ?? accounts[0]?.id} className={selectCls}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!editing ? (
        <label className="flex min-h-12 items-center justify-between border-t border-border pt-3 text-[15px]">
          {kind === 'expense' ? 'Já paguei' : 'Já recebi'}
          <input type="checkbox" name="paid" defaultChecked={date <= today} className="size-5 accent-[var(--brand)]" />
        </label>
      ) : null}

      <details className="border-t border-border pt-3" open={editing && Boolean(existing?.notes || existing?.ignored)}>
        <summary className="cursor-pointer text-[13px] font-semibold text-brand">Mais detalhes{!editing ? ': repetir, parcelar, observação' : ''}</summary>
        <div className="mt-3 flex flex-col gap-4">
          {!editing ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="f-repeat" className={labelCls}>Repetir</label>
                <select id="f-repeat" name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)} className={selectCls}>
                  <option value="none">Não repete</option>
                  <option value="installment">Parcelado (divide o valor)</option>
                  <option value="monthly">Todo mês (mesmo valor)</option>
                </select>
              </div>
              {repeat !== 'none' ? (
                <div className="flex flex-col gap-1">
                  <label htmlFor="f-count" className={labelCls}>{repeat === 'installment' ? 'Número de parcelas' : 'Quantas vezes (vazio = sem fim)'}</label>
                  <input id="f-count" name="repeatCount" type="number" min={2} max={repeat === 'installment' ? 72 : 120} required={repeat === 'installment'} defaultValue={repeat === 'installment' ? 2 : ''} className={selectCls} />
                  {f['repeat.count'] ? <span className="text-[13px] text-expense">{f['repeat.count']}</span> : null}
                </div>
              ) : null}
            </div>
          ) : existing?.series ? (
            <p className="text-[13px] text-ink-2">
              {existing.series.type === 'installment' ? `Parcela ${existing.series.number} de ${existing.series.total}.` : 'Lançamento recorrente.'} A edição vale só para este mês.
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="f-notes" className={labelCls}>Observação</label>
            <textarea id="f-notes" name="notes" defaultValue={existing?.notes ?? ''} maxLength={500} rows={2} className="rounded-[8px] border border-ink-3 bg-surface px-3 py-2 text-[15px]" />
          </div>
          <label className="flex items-start gap-2 text-[15px]">
            <input type="checkbox" name="ignored" defaultChecked={existing?.ignored} className="mt-1 size-5 accent-[var(--brand)]" />
            <span>
              Ignorar nos totais
              <span className="block text-[13px] text-ink-2">Fica no extrato, mas não entra no saldo nem nos relatórios.</span>
            </span>
          </label>
        </div>
      </details>

      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Link href={cancelHref} className="grid h-12 place-items-center rounded-[12px] px-4 text-[15px] font-semibold text-brand">Cancelar</Link>
        {!editing ? (
          <button name="again" value="1" className="h-12 rounded-[12px] border border-border px-4 text-[15px] font-semibold text-brand">Salvar e lançar outro</button>
        ) : null}
        <SubmitButton>{editing ? 'Salvar alterações' : 'Salvar'}</SubmitButton>
      </div>
    </form>
  );
}
