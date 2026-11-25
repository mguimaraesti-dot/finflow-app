'use client';

import { useActionState, useState } from 'react';
import { createSharedWorkspaceAction, inviteAction } from '@/app/actions';
import { Field, FormMessage, SubmitButton } from '@/components/ui';

export function CreateSharedForm() {
  const [state, action] = useActionState(createSharedWorkspaceAction, null);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-[20px] bg-surface p-4">
      <h2 className="text-[16px] font-semibold">Criar espaço Casal</h2>
      <p className="text-[13px] text-ink-2">Opcional. Vocês dois veem e lançam no Casal; o seu Pessoal continua só seu.</p>
      <FormMessage state={state} />
      <Field label="Nome do espaço" name="name" defaultValue="Casal" error={state?.fields?.name} />
      <SubmitButton variant="secondary">Criar espaço</SubmitButton>
    </form>
  );
}

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [state, action] = useActionState(inviteAction, null);
  const [copied, setCopied] = useState(false);
  const link = state?.data?.inviteUrl;
  return (
    <form action={action} className="flex flex-col gap-3 border-t border-border pt-3">
      <FormMessage state={state} />
      {link ? (
        <div className="flex flex-col gap-2">
          <input readOnly value={link} aria-label="Link do convite" className="h-11 rounded-[8px] border border-border bg-surface-2 px-3 text-[13px]" />
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
            className="h-11 rounded-[12px] border border-border text-[15px] font-semibold text-brand"
          >
            {copied ? 'Link copiado' : 'Copiar link'}
          </button>
        </div>
      ) : null}
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Field label="E-mail do parceiro ou parceira" name="email" type="email" inputMode="email" error={state?.fields?.email} />
      <SubmitButton>Criar convite</SubmitButton>
    </form>
  );
}
