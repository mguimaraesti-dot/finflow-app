'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from '@/app/actions';
import { googleSignInAction } from '@/app/google-actions';
import { Field, FormMessage, SubmitButton } from '@/components/ui';

function GoogleButton({ next, label }: { next?: string; label: string }) {
  return (
    <form action={googleSignInAction}>
      <input type="hidden" name="next" value={next ?? ''} />
      <button className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[12px] border border-border bg-surface text-[15px] font-semibold text-ink hover:bg-surface-2">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" />
        </svg>
        {label}
      </button>
    </form>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-[13px] text-ink-2">
      <span className="h-px flex-1 bg-border" />
      ou
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

const GOOGLE_ERRORS: Record<string, string> = {
  google: 'Não foi possível entrar com o Google. Tente de novo.',
  email: 'O Google não confirmou este e-mail. Entre com e-mail e senha.',
};

export function LoginForm({ next, notice, google, error }: { next?: string; notice?: string; google?: boolean; error?: string }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <div className="flex flex-col gap-4 rounded-[20px] bg-surface p-6">
      <h1 className="text-[20px] font-semibold">Entrar</h1>
      {error && GOOGLE_ERRORS[error] ? <p role="alert" className="rounded-[12px] bg-expense-tint px-4 py-3 text-[13px] text-expense">{GOOGLE_ERRORS[error]}</p> : null}
      {notice ? <p className="rounded-[12px] bg-income-tint px-4 py-3 text-[13px] text-income">{notice}</p> : null}
      {google ? (
        <>
          <GoogleButton next={next} label="Entrar com Google" />
          <Divider />
        </>
      ) : null}
      <form action={action} className="flex flex-col gap-4">
        <FormMessage state={state} />
        <input type="hidden" name="next" value={next ?? ''} />
        <Field label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" error={state?.fields?.email} />
        <Field label="Senha" name="password" type="password" autoComplete="current-password" error={state?.fields?.password} />
        <SubmitButton>Entrar</SubmitButton>
      </form>
      <div className="flex justify-between text-[13px] font-semibold">
        <Link href="/esqueci-senha" className="text-brand">Esqueci a senha</Link>
        <Link href={next ? `/cadastro?next=${encodeURIComponent(next)}` : '/cadastro'} className="text-brand">Criar conta</Link>
      </div>
    </div>
  );
}

export function RegisterForm({ next, google }: { next?: string; google?: boolean }) {
  const [state, action] = useActionState(registerAction, null);
  return (
    <div className="flex flex-col gap-4 rounded-[20px] bg-surface p-6">
      <h1 className="text-[20px] font-semibold">Criar conta</h1>
      <p className="text-[13px] text-ink-2">Você começa com um espaço Pessoal, só seu. Depois pode criar um espaço Casal.</p>
      {google ? (
        <>
          <GoogleButton next={next} label="Continuar com Google" />
          <p className="text-[12px] text-ink-2">Ao continuar com o Google, você aceita os termos de uso e a política de privacidade.</p>
          <Divider />
        </>
      ) : null}
      <form action={action} className="flex flex-col gap-4">
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
      </form>
      <Link href="/entrar" className="text-center text-[13px] font-semibold text-brand">Já tenho conta</Link>
    </div>
  );
}

export function ForgotForm({ google }: { google?: boolean }) {
  const [state, action] = useActionState(forgotPasswordAction, null);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-[20px] bg-surface p-6">
      <h1 className="text-[20px] font-semibold">Esqueci a senha</h1>
      <FormMessage state={state} />
      <Field label="E-mail da conta" name="email" type="email" autoComplete="email" inputMode="email" error={state?.fields?.email} />
      <SubmitButton>Enviar link</SubmitButton>
      {google ? (
        <p className="text-[13px] text-ink-2">
          Se o seu e-mail é do Google, é mais rápido <Link href="/entrar" className="font-semibold text-brand">entrar com o Google</Link>: não precisa de senha.
        </p>
      ) : null}
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
