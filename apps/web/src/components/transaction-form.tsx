'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, CreditCard, EyeOff, FileText, Landmark, Layers, Repeat, StickyNote, Tag } from 'lucide-react';
import { invoiceForPurchase, isValidIsoDate, MAX_CARD_INSTALLMENTS } from '@finflow/shared';
import { createTransactionAction, updateTransactionAction } from '@/app/transaction-actions';
import { FormMessage, SubmitButton } from '@/components/ui';
import { monthLabel } from '@/lib/format';
import type { AccountSummary, CardSummary, Category, TransactionItem } from '@/lib/types';
import { MoneyInput } from './money-input';

type Kind = 'expense' | 'income';

const fieldCls = 'h-11 w-full min-w-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3';
const chipCls =
  'min-h-8 rounded-full border border-border px-3 text-[13px] font-semibold text-ink-2 aria-pressed:border-brand aria-pressed:bg-brand-tint aria-pressed:text-brand-strong';

/** Linha do formulário: ícone à esquerda, campo ocupando o resto, divisória embaixo. */
function Row({ icon: Icon, label, children, hint }: { icon: typeof Tag; label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-border py-1.5">
      <Icon size={20} strokeWidth={1.5} className="mt-3 shrink-0 text-ink-2" aria-label={label} />
      <div className="flex min-w-0 flex-1 flex-col">
        {children}
        {hint}
      </div>
    </div>
  );
}

function Switch({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex h-11 cursor-pointer items-center justify-between gap-3 text-[15px]">
      {label}
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-6 w-10 shrink-0 rounded-full bg-ink-3/50 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-surface after:shadow after:transition-transform peer-checked:bg-brand peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-brand"
      />
    </label>
  );
}

export function TransactionForm({
  workspaceId,
  accounts,
  categories,
  today,
  existing,
  cancelHref,
  cards = [],
  defaultCardId,
}: {
  workspaceId: string;
  accounts: AccountSummary[];
  categories: Category[];
  today: string;
  existing?: TransactionItem;
  cancelHref: string;
  cards?: CardSummary[];
  defaultCardId?: string;
}) {
  const editing = Boolean(existing);
  const [state, action] = useActionState(editing ? updateTransactionAction : createTransactionAction, null);
  const [kind, setKind] = useState<Kind>(existing?.kind === 'income' ? 'income' : 'expense');
  const [date, setDate] = useState(existing?.date ?? today);
  const [paid, setPaid] = useState(true);
  const [paidTouched, setPaidTouched] = useState(false);
  const [ignored, setIgnored] = useState(existing?.ignored ?? false);
  const [repeat, setRepeat] = useState<'none' | 'installment' | 'monthly'>('none');
  const [method, setMethod] = useState<'account' | 'card'>(defaultCardId && cards.length ? 'card' : 'account');
  const [cardId, setCardId] = useState(cards.find((c) => c.id === defaultCardId)?.id ?? cards[0]?.id ?? '');
  const onCard = !editing && kind === 'expense' && method === 'card' && cards.length > 0;
  const card = cards.find((c) => c.id === cardId);
  const invoiceHint = onCard && card && isValidIsoDate(date) ? monthLabel(invoiceForPurchase(card, date).referenceMonth.slice(0, 7)) : null;
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [state]);
  // Depois de "Salvar e criar novo", os campos voltam ao começo.
  const resetKey = state?.ok ? idempotencyKey : 'form';
  const cats = categories.filter((c) => c.kind === kind);
  const f = state?.fields ?? {};
  const yesterday = useMemo(() => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [today]);
  const other = date !== today && date !== yesterday;

  function pickDate(value: string) {
    setDate(value);
    // Data futura nasce pendente, a não ser que a pessoa tenha mexido na chave.
    if (!paidTouched) setPaid(value <= today);
  }

  if (accounts.length === 0) {
    return (
      <p className="rounded-[20px] bg-surface p-6 text-[15px]">
        Antes de lançar, cadastre uma conta no <Link href="/inicio" className="font-semibold text-brand">Início</Link>.
      </p>
    );
  }

  const paidWord = kind === 'expense' ? 'Foi paga' : 'Foi recebida';

  return (
    <form action={action} className="flex flex-col gap-3 rounded-[20px] bg-surface p-4 md:p-6">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {existing ? <input type="hidden" name="id" value={existing.id} /> : null}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="method" value={onCard ? 'card' : 'account'} />

      {!editing ? (
        <div className="flex flex-col gap-2">
          <div role="group" aria-label="Tipo" className="grid grid-cols-2 gap-[3px] rounded-[8px] bg-surface-2 p-[3px]">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-[6px] py-2.5 text-[13px] font-semibold text-ink-2 aria-pressed:bg-surface ${k === 'expense' ? 'aria-pressed:text-expense' : 'aria-pressed:text-income'}`}
              >
                {k === 'expense' ? 'Despesa' : 'Receita'}
              </button>
            ))}
          </div>
          {kind === 'expense' && cards.length > 0 ? (
            <div role="group" aria-label="Pagar com" className="flex gap-2">
              {(['account', 'card'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)} className={chipCls}>
                  {m === 'account' ? 'Na conta' : 'No cartão de crédito'}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className={`text-[13px] font-semibold ${kind === 'expense' ? 'text-expense' : 'text-income'}`}>{kind === 'expense' ? 'Despesa' : 'Receita'}</p>
      )}

      <MoneyInput key={resetKey} name="amount" defaultCents={existing?.amount ?? 0} tone={kind} error={f.amount} autoFocus={!editing} />
      <FormMessage state={state} />

      <div className="flex flex-col">
        {!editing && !onCard ? (
          <Row icon={CheckCircle2} label="Situação">
            <Switch name="paid" checked={paid} label={paidWord} onChange={(v) => { setPaid(v); setPaidTouched(true); }} />
          </Row>
        ) : null}

        <Row icon={CalendarDays} label="Data" hint={f.date ? <span className="pb-1 text-[13px] text-expense">{f.date}</span> : null}>
          <div className="flex min-h-11 flex-wrap items-center gap-2 py-1">
            <button type="button" aria-pressed={date === today} onClick={() => pickDate(today)} className={chipCls}>Hoje</button>
            <button type="button" aria-pressed={date === yesterday} onClick={() => pickDate(yesterday)} className={chipCls}>Ontem</button>
            <label className={`${chipCls} relative flex items-center ${other ? 'border-brand bg-brand-tint text-brand-strong' : ''}`}>
              {other && isValidIsoDate(date) ? date.split('-').reverse().join('/') : 'Outra data'}
              <input
                type="date"
                name="date"
                value={date}
                required
                onChange={(e) => pickDate(e.target.value)}
                aria-label="Escolher outra data"
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
        </Row>

        <Row icon={FileText} label="Descrição" hint={f.description ? <span className="pb-1 text-[13px] text-expense">{f.description}</span> : null}>
          <input
            key={resetKey}
            name="description"
            defaultValue={existing?.description}
            required
            maxLength={120}
            placeholder="Descrição"
            aria-label="Descrição"
            aria-invalid={Boolean(f.description)}
            className={fieldCls}
          />
        </Row>

        <Row icon={Tag} label="Categoria">
          <select key={kind} name="categoryId" defaultValue={existing?.category?.id ?? ''} aria-label="Categoria" className={fieldCls}>
            <option value="">Sem categoria</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Row>

        {onCard ? (
          <>
            <Row
              icon={CreditCard}
              label="Cartão"
              hint={invoiceHint ? <span className="pb-1 text-[13px] text-ink-2">Entra na fatura de {invoiceHint.toLowerCase()}.</span> : null}
            >
              <select name="cardId" value={cardId} onChange={(e) => setCardId(e.target.value)} aria-label="Cartão" className={fieldCls}>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Row>
            <Row icon={Layers} label="Parcelas">
              <select name="installments" defaultValue="1" aria-label="Parcelas" className={fieldCls}>
                {Array.from({ length: MAX_CARD_INSTALLMENTS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n === 1 ? 'À vista' : `Parcelado em ${n}x`}</option>
                ))}
              </select>
            </Row>
          </>
        ) : (
          <Row icon={Landmark} label="Conta">
            <select name="accountId" defaultValue={existing?.account?.id ?? accounts[0]?.id} aria-label="Conta" className={fieldCls}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Row>
        )}

        {!onCard ? (
          <Row icon={EyeOff} label="Ignorar" hint={ignored ? <span className="pb-1 text-[13px] text-ink-2">Fica no extrato, mas não entra no saldo nem nos totais.</span> : null}>
            <Switch name="ignored" checked={ignored} label="Ignorar nos totais" onChange={setIgnored} />
          </Row>
        ) : null}
      </div>

      <details className="group" open={editing && Boolean(existing?.notes)}>
        <summary className="flex h-11 cursor-pointer list-none items-center justify-end gap-1 text-[13px] font-semibold text-brand">
          Mais detalhes <span className="transition-transform group-open:rotate-90" aria-hidden>›</span>
        </summary>
        <div className="flex flex-col">
          {!editing && !onCard ? (
            <Row icon={Repeat} label="Repetir">
              <div className="flex flex-col gap-2 py-1 md:flex-row md:items-center">
                <select name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)} aria-label="Repetir" className={fieldCls}>
                  <option value="none">Não repete</option>
                  <option value="installment">Parcelado (divide o valor)</option>
                  <option value="monthly">Todo mês (mesmo valor)</option>
                </select>
                {repeat !== 'none' ? (
                  <input
                    name="repeatCount"
                    type="number"
                    min={2}
                    max={repeat === 'installment' ? 72 : 120}
                    required={repeat === 'installment'}
                    defaultValue={repeat === 'installment' ? 2 : ''}
                    aria-label={repeat === 'installment' ? 'Número de parcelas' : 'Quantas vezes (vazio = sem fim)'}
                    placeholder={repeat === 'installment' ? 'Parcelas' : 'Vezes (vazio = sem fim)'}
                    className="h-11 rounded-[8px] border border-border px-3 text-[15px] md:w-56"
                  />
                ) : null}
              </div>
              {f['repeat.count'] ? <span className="text-[13px] text-expense">{f['repeat.count']}</span> : null}
            </Row>
          ) : editing && existing?.series ? (
            <p className="py-2 text-[13px] text-ink-2">
              {existing.series.type === 'installment' ? `Parcela ${existing.series.number} de ${existing.series.total}.` : 'Lançamento recorrente.'} A edição vale só para este mês.
            </p>
          ) : null}
          <Row icon={StickyNote} label="Observação">
            <textarea key={resetKey} name="notes" defaultValue={existing?.notes ?? ''} maxLength={500} rows={2} placeholder="Observação" aria-label="Observação" className="w-full resize-none bg-transparent py-3 text-[15px] outline-none placeholder:text-ink-3" />
          </Row>
        </div>
      </details>

      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Link href={cancelHref} className="grid h-12 place-items-center rounded-[12px] px-4 text-[15px] font-semibold text-brand">Cancelar</Link>
        {!editing ? (
          <button name="again" value="1" className="h-12 rounded-[12px] border border-border px-4 text-[15px] font-semibold text-brand">Salvar e criar novo</button>
        ) : null}
        <SubmitButton>{editing ? 'Salvar alterações' : 'Salvar'}</SubmitButton>
      </div>
    </form>
  );
}
