'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from '@/app/actions';
import { Field, FormMessage, SubmitButton } from '@/components/ui';

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-[20px] bg-surface p-6">
      <h1 className="text-[20px] font-semibold">Entrar</h1>
      {notice ? <p className="rounded-[12px] bg-income-tint px-4 py-3 text-[13px] text-income">{notice}</p> : null}
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ''} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" error={state?.fields?.email} />
      <Field label="Senha" name="password" type="password" autoComplete="current-password" error={state?.fields?.password} />
      <SubmitButton>Entrar</SubmitButton>
      <div className="flex justify-between text-[13px] font-semibold">
        <Link href="/esqueci-senha" className="text-brand">Esqueci a senha</Link>
        <Link href={next ? `/cadastro?next=${encodeURIComponent(next)}` : '/cadastro'} className="text-brand">Criar conta</Link>
      </div>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const [state, action] = useActionState(registerAction, null);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-[20px] bg-surface p-6">
      <h1 className="text-[20px] font-semibold">Criar conta</h1>
      <p className="text-[13px] text-ink-2">Você começa com um espaço Pessoal, só seu. Depois pode criar um espaço Casal.</p>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ''} />
      <Field label="Seu nome" name="name" autoComplete="given-name" error={state?.fields?.name} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" error={state?.fields?.email} />
      <Field label="Senha (mínimo 10 caracteres)" name="password" type="password" autoComplete="new-password" error={state?.fields?.password} />
      <label className="flex items-start gap-2 text-[13px] text-ink-2">
        <input type="checkbox" name="terms" className="mt-1 size-4 accent-[var(--brand)]" />
        <span>Li e aceito os termos de uso e a política de privacidade.</span>
      </label>
      {state?.fields?.terms ? <span className="text-[13px] text-expense">{state.fields.terms}</span> : null}
      <SubmitButton>Criar conta</SubmitButton>
      <Link href="/entrar" className="text-center text-[13px] font-semibold text-brand">Já tenho conta</Link>
    </form>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState(forgotPasswordAction, null);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-[20px] bg-surface p-6">
      <h1 className="text-[20px] font-semibold">Esqueci a senha</h1>
      <FormMessage state={state} />
      <Field label="E-mail da conta" name="email" type="email" autoComplete="email" inputMode="email" error={state?.fields?.email} />
      <SubmitButton>Enviar link</SubmitButton>
      <Link href="/entrar" className="text-center text-[13px] font-semibold text-brand">Voltar para entrar</Link>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-[20px] bg-surface p-6">
      <h1 className="text-[20px] font-semibold">Nova senha</h1>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <Field label="Nova senha (mínimo 10 caracteres)" name="password" type="password" autoComplete="new-password" error={state?.fields?.password} />
      <SubmitButton>Salvar nova senha</SubmitButton>
    </form>
  );
}
