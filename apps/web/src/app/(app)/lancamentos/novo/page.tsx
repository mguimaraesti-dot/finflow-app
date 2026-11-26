import type { Metadata } from 'next';
import { isValidMonth, todayIn } from '@finflow/shared';
import { AppShell } from '@/components/app-shell';
import { TransactionForm } from '@/components/transaction-form';
import { api } from '@/lib/api';
import { getContext } from '@/lib/session';
import type { AccountSummary, CardSummary, Category } from '@/lib/types';

export const metadata: Metadata = { title: 'Novo lançamento' };

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string; cartao?: string; tipo?: string }> }) {
  const sp = await searchParams;
  const here = '/lancamentos/novo';
  const ctx = await getContext(here);
  const [accounts, categories, cards] = await Promise.all([
    api<AccountSummary[]>(`/workspaces/${ctx.active.id}/accounts`, { returnTo: here }),
    api<Category[]>(`/workspaces/${ctx.active.id}/categories`, { returnTo: here }),
    api<CardSummary[]>(`/workspaces/${ctx.active.id}/cards`, { returnTo: here }),
  ]);
  const month = sp.mes && isValidMonth(sp.mes) ? sp.mes : '';
  const cartao = sp.cartao && /^[0-9a-f-]{36}$/i.test(sp.cartao) ? sp.cartao : undefined;
  return (
    <AppShell {...ctx} current="/lancamentos">
      <h1 className="text-[20px] font-semibold">Novo lançamento <span className="text-[13px] font-normal text-ink-2">no espaço {ctx.active.name}</span></h1>
      <TransactionForm
        workspaceId={ctx.active.id}
        accounts={accounts}
        categories={categories}
        today={todayIn('America/Sao_Paulo')}
        cards={cards}
        defaultCardId={cartao}
        defaultKind={sp.tipo === 'transferencia' ? 'transfer' : sp.tipo === 'receita' ? 'income' : 'expense'}
        cancelHref={cartao ? `/cartoes/${cartao}` : `/lancamentos${month ? `?mes=${month}` : ''}`}
      />
    </AppShell>
  );
}
