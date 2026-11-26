import Link from 'next/link';
import { CalendarClock, CreditCard, Home, List, LogOut, Plus, Users } from 'lucide-react';
import { logoutAction, switchWorkspaceAction } from '@/app/actions';
import type { Me, WorkspaceSummary } from '@/lib/types';

const NAV = [
  { href: '/inicio', label: 'Início', icon: Home },
  { href: '/lancamentos', label: 'Lançamentos', icon: List },
  { href: '/a-pagar', label: 'A pagar e receber', icon: CalendarClock },
  { href: '/cartoes', label: 'Cartões', icon: CreditCard },
  { href: '/espacos', label: 'Espaços', icon: Users },
] as const;

// No celular cabem quatro destinos ao redor do botão de lançar; "A pagar" fica no Início.
const MOBILE_LEFT = [NAV[0], NAV[1]];
const MOBILE_RIGHT = [NAV[3], NAV[4]];

export function AppShell({
  me,
  workspaces,
  active,
  current,
  children,
}: {
  me: Me;
  workspaces: WorkspaceSummary[];
  active: WorkspaceSummary;
  current: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1100px] flex-wrap">
      <aside className="hidden w-[232px] shrink-0 flex-col gap-1 border-r border-border px-3 py-6 md:flex">
        <p className="px-3 pb-4 text-[20px] font-semibold">FinFlow</p>
        <Link href="/lancamentos/novo" className="mb-3 flex h-11 items-center justify-center gap-2 rounded-[12px] bg-brand text-[15px] font-semibold text-on-brand">
          <Plus size={18} aria-hidden /> Novo lançamento
        </Link>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={current === href ? 'page' : undefined}
            className="flex h-11 items-center gap-3 rounded-[8px] px-3 text-[15px] text-ink-2 aria-[current=page]:bg-brand-tint aria-[current=page]:font-semibold aria-[current=page]:text-brand-strong"
          >
            <Icon size={20} strokeWidth={1.5} aria-hidden /> {label}
          </Link>
        ))}
        <form action={logoutAction} className="mt-auto">
          <button className="flex h-11 w-full items-center gap-3 rounded-[8px] px-3 text-[15px] text-ink-2 hover:bg-surface-2">
            <LogOut size={20} strokeWidth={1.5} aria-hidden /> Sair
          </button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-[999_1_560px] flex-col">
        <header className="flex flex-col gap-3 px-4 pt-6 md:px-8">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-ink-2">Olá, {me.name.split(' ')[0]}</p>
            <form action={logoutAction} className="md:hidden">
              <button aria-label="Sair" className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink-2">
                <LogOut size={20} strokeWidth={1.5} aria-hidden />
              </button>
            </form>
          </div>
          {workspaces.length > 1 ? (
            <form action={switchWorkspaceAction} role="tablist" aria-label="Espaço" className="grid max-w-[420px] auto-cols-fr grid-flow-col gap-[3px] rounded-[8px] bg-surface-2 p-[3px]">
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  role="tab"
                  name="workspaceId"
                  value={w.id}
                  aria-selected={w.id === active.id}
                  className="truncate rounded-[6px] px-2 py-2 text-[13px] font-semibold text-ink-2 aria-selected:bg-surface aria-selected:text-ink"
                >
                  {w.name}
                </button>
              ))}
            </form>
          ) : null}
        </header>
        <main className="flex flex-col gap-4 px-4 pb-28 pt-4 md:px-8 md:pb-10">{children}</main>
      </div>

      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 grid h-[72px] grid-cols-[1fr_1fr_72px_1fr_1fr] border-t border-border bg-surface pb-2 md:hidden">
        {MOBILE_LEFT.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={current === href ? 'page' : undefined}
            className="flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold text-ink-2 aria-[current=page]:text-brand"
          >
            <Icon size={24} strokeWidth={1.5} aria-hidden />
            {label}
          </Link>
        ))}
        <Link
          href="/lancamentos/novo"
          aria-label="Novo lançamento"
          className="mx-auto -mt-5 grid size-14 place-items-center rounded-full bg-brand text-on-brand shadow-[0_-4px_24px_rgba(14,20,19,0.10)]"
        >
          <Plus size={28} strokeWidth={2} aria-hidden />
        </Link>
        {MOBILE_RIGHT.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={current === href ? 'page' : undefined}
            className="flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold text-ink-2 aria-[current=page]:text-brand"
          >
            <Icon size={24} strokeWidth={1.5} aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
