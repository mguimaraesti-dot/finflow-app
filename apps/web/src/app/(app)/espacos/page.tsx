import type { Metadata } from 'next';
import { revokeInviteAction } from '@/app/actions';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api';
import { getContext } from '@/lib/session';
import type { PendingInvite } from '@/lib/types';
import { CreateSharedForm, InviteForm } from './forms';

export const metadata: Metadata = { title: 'Espaços' };

export default async function Page() {
  const ctx = await getContext('/espacos');
  const shared = ctx.workspaces.filter((w) => w.type === 'shared');
  const invitesByWs = Object.fromEntries(
    await Promise.all(
      shared
        .filter((w) => w.role === 'owner')
        .map(async (w) => [w.id, await api<PendingInvite[]>(`/workspaces/${w.id}/invites`, { returnTo: '/espacos' })] as const),
    ),
  );

  return (
    <AppShell {...ctx} current="/espacos">
      <div>
        <h1 className="text-[20px] font-semibold">Espaços</h1>
        <p className="text-[13px] text-ink-2">Cada espaço tem suas próprias contas, cartões e lançamentos. O Pessoal nunca aparece para outra pessoa.</p>
      </div>

      {ctx.workspaces.map((w) => (
        <section key={w.id} className="flex flex-col gap-3 rounded-[20px] bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold">{w.name}</h2>
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-ink-2">{w.type === 'personal' ? 'Só você' : 'Compartilhado'}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {w.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-brand text-[13px] font-semibold text-on-brand">{m.name.charAt(0).toUpperCase()}</span>
                <span className="text-[15px]">{m.userId === ctx.me.id ? `${m.name} (você)` : m.name}</span>
                <span className="ml-auto text-[13px] text-ink-2">{m.role === 'owner' ? 'Dono' : m.role === 'editor' ? 'Pode editar' : 'Só leitura'}</span>
              </li>
            ))}
          </ul>
          {w.type === 'shared' && w.role === 'owner' ? (
            <>
              {(invitesByWs[w.id] ?? []).map((inv) => (
                <form key={inv.id} action={revokeInviteAction} className="flex items-center justify-between gap-2 rounded-[12px] bg-warning-tint px-3 py-2 text-[13px] text-warning">
                  <span className="truncate">Convite pendente para {inv.email}</span>
                  <input type="hidden" name="workspaceId" value={w.id} />
                  <input type="hidden" name="inviteId" value={inv.id} />
                  <button className="font-semibold underline">Cancelar</button>
                </form>
              ))}
              {w.members.length < 2 ? <InviteForm workspaceId={w.id} /> : null}
            </>
          ) : null}
        </section>
      ))}

      {shared.length === 0 ? <CreateSharedForm /> : null}
    </AppShell>
  );
}
