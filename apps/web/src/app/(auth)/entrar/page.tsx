import type { Metadata } from 'next';
import { googleLoginEnabled } from '@/lib/supabase';
import { LoginForm } from '../forms';

export const metadata: Metadata = { title: 'Entrar' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; senha?: string; erro?: string }> }) {
  const sp = await searchParams;
  return <LoginForm next={sp.next} google={googleLoginEnabled()} error={sp.erro} notice={sp.senha === 'redefinida' ? 'Senha redefinida. Entre com a nova senha.' : undefined} />;
}
