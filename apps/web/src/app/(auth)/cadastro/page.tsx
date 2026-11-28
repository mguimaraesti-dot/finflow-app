import type { Metadata } from 'next';
import { googleLoginEnabled } from '@/lib/supabase';
import { RegisterForm } from '../forms';

export const metadata: Metadata = { title: 'Criar conta' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  return <RegisterForm next={sp.next} google={googleLoginEnabled()} />;
}
