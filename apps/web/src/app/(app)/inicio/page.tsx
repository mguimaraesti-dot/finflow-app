import type { Metadata } from 'next';
import { formatBRL } from '@finflow/shared';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api';
import { getContext } from '@/lib/session';
import type { AccountSummary } from '@/lib/types';
import { NewAccountForm } from './new-account-form';

export const metadata: Metadata = { title: 'Início' };

export default async function Page() {
  const ctx = await getContext('/inicio');
  const accounts = await api<AccountSummary[]>(`/workspaces/${ctx.active.id}/accounts`, { returnTo: '/inicio' });
  const counted = accounts.filter((a) => a.includeInTotal);
  const total = counted.reduce((s, a) => s + a.currentBalance, 0);
  const projected = counted.reduce((s, a) => s + a.projectedBalance, 0);
  const canWrite = ctx.active.role === 'owner' || ctx.active.role === 'editor';

  return (
    <AppShell {...ctx} current="/inicio">
      <section className="rounded-[20px] bg-surface px-4 py-6">
        <p className="text-[13px] text-ink-2">Saldo atual em contas · {ctx.active.name}</p>
        <p className={`num mt-1 text-[32px] font-semibold leading-[38px] tracking-[-0.5px] ${total < 0 ? 'text-expense' : ''}`}>{formatBRL(total)}</p>
        <p className="mt-4 flex justify-between border-t border-border pt-3 text-[13px] text-ink-2">
          Previsto com pendentes <span className="num font-semibold text-ink">{formatBRL(projected)}</span>
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[16px] font-semibold">Contas</h2>
        {accounts.length === 0 ? (
          <p className="rounded-[12px] bg-surface p-4 text-[15px] text-ink-2">Cadastre sua primeira conta para ver seu saldo.</p>
        ) : (
          <ul className="overflow-hidden rounded-[12px] bg-surface">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between border-t border-border px-4 py-3 first:border-t-0">
                <span className="text-[15px]">{a.name}</span>
                <span className={`num text-[15px] font-semibold ${a.currentBalance < 0 ? 'text-expense' : ''}`}>{formatBRL(a.currentBalance)}</span>
              </li>
            ))}
          </ul>
        )}
        {canWrite ? <NewAccountForm workspaceId={ctx.active.id} /> : <p className="text-[13px] text-ink-2">Você tem acesso só de leitura neste espaço.</p>}
      </section>

      <p className="text-[13px] text-ink-2">Lançamentos, cartões e faturas chegam no próximo incremento do MVP.</p>
    </AppShell>
  );
}
