'use client';

import { useFormStatus } from 'react-dom';
import type { FormState } from '@/lib/types';

export function SubmitButton({ children, variant = 'primary', className = '' }: { children: React.ReactNode; variant?: 'primary' | 'secondary'; className?: string }) {
  const { pending } = useFormStatus();
  const styles =
    variant === 'primary'
      ? 'bg-brand text-on-brand hover:bg-brand-strong'
      : 'bg-surface text-brand border border-border hover:bg-brand-tint';
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`h-12 rounded-[12px] px-4 text-[15px] font-semibold transition-colors disabled:opacity-60 ${styles} ${className}`}
    >
      {pending ? 'Aguarde…' : children}
    </button>
  );
}

export function Field({
  label,
  name,
  type = 'text',
  error,
  autoComplete,
  defaultValue,
  inputMode,
  placeholder,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  autoComplete?: string;
  defaultValue?: string;
  inputMode?: 'text' | 'email' | 'decimal';
  placeholder?: string;
  required?: boolean;
}) {
  const id = `f-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        className="h-12 rounded-[8px] border border-ink-3 bg-surface px-3 text-[15px] text-ink aria-invalid:border-expense"
      />
      {error ? (
        <span id={`${id}-err`} className="text-[13px] text-expense">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state?.message) return null;
  return (
    <p role="status" className={`rounded-[12px] px-4 py-3 text-[13px] ${state.ok ? 'bg-income-tint text-income' : 'bg-expense-tint text-expense'}`}>
      {state.message}
    </p>
  );
}
