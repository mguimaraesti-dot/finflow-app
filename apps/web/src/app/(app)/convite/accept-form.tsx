'use client';

import { useActionState } from 'react';
import { acceptInviteAction } from '@/app/actions';
import { FormMessage, SubmitButton } from '@/components/ui';

export function AcceptForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInviteAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton>Aceitar convite</SubmitButton>
    </form>
  );
}
