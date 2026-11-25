import type { Metadata } from 'next';
import { LoginForm } from '../forms';

export const metadata: Metadata = { title: 'Entrar' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; senha?: string }> }) {
  const sp = await searchParams;
  return <LoginForm next={sp.next} notice={sp.senha === 'redefinida' ? 'Senha redefinida. Entre com a nova senha.' : undefined} />;
}
