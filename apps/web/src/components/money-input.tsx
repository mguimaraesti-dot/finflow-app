'use client';

import { formatBRL } from '@finflow/shared';
import { useState } from 'react';

/** Valor digitado da direita para a esquerda (centavos primeiro), como no caixa: 1-5-0-0 → R$ 15,00. */
export function MoneyInput({
  name,
  defaultCents = 0,
  tone = 'ink',
  error,
  autoFocus,
}: {
  name: string;
  defaultCents?: number;
  tone?: 'ink' | 'income' | 'expense';
  error?: string;
  autoFocus?: boolean;
}) {
  const [cents, setCents] = useState(defaultCents);
  const color = cents === 0 ? 'text-ink-3' : tone === 'income' ? 'text-income' : tone === 'expense' ? 'text-expense' : 'text-ink';
  return (
    <div className="flex flex-col items-center gap-1">
      <label htmlFor={`f-${name}`} className="text-[13px] text-ink-2">Valor</label>
      <input
        id={`f-${name}`}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-invalid={Boolean(error)}
        value={formatBRL(cents)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 13);
          setCents(digits ? Number(digits) : 0);
        }}
        className={`num w-full bg-transparent text-center text-[36px] font-semibold leading-[44px] tracking-[-0.5px] outline-none ${color}`}
      />
      <input type="hidden" name={name} value={cents} />
      {error ? <span className="text-[13px] text-expense">{error}</span> : null}
    </div>
  );
}
