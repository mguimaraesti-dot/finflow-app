import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError, REFRESH_COOKIE } from '@/lib/api';
import { AcceptForm } from './accept-form';

export const metadata: Metadata = { title: 'Convite' };

interface Preview {
  workspaceName: string;
  invitedByName: string;
  email: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
}

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const here = `/convite?token=${encodeURIComponent(token ?? '')}`;
  if (!(await cookies()).get(REFRESH_COOKIE)) redirect(`/entrar?next=${encodeURIComponent(here)}`);

  let preview: Preview | null = null;
  let problem: string | null = token ? null : 'Link de convite incompleto.';
  if (token) {
    try {
      preview = await api<Preview>('/invites/preview', { method: 'POST', body: { token }, returnTo: here });
    } catch (e) {
      problem = e instanceof ApiError && e.status === 404 ? 'Convite não encontrado.' : 'Não foi possível abrir o convite.';
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center gap-4 px-4">
      <p className="text-[28px] font-semibold">FinFlow</p>
      <section className="flex flex-col gap-3 rounded-[20px] bg-surface p-6">
        {problem || !preview ? (
          <p className="text-[15px]">{problem}</p>
        ) : preview.status !== 'pending' ? (
          <p className="text-[15px]">
            {preview.status === 'accepted' ? 'Este convite já foi usado.' : preview.status === 'expired' ? 'Este convite expirou. Peça um novo.' : 'Este convite foi cancelado.'}
          </p>
        ) : (
          <>
            <h1 className="text-[20px] font-semibold">Entrar no espaço {preview.workspaceName}</h1>
            <p className="text-[15px] text-ink-2">
              {preview.invitedByName} convidou {preview.email} para compartilhar contas, cartões e lançamentos. Seu espaço Pessoal continua só seu.
            </p>
            <AcceptForm token={token!} />
          </>
        )}
      </section>
    </main>
  );
}
