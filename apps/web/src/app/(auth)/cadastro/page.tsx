import type { Metadata } from 'next';
import { RegisterForm } from '../forms';

export const metadata: Metadata = { title: 'Criar conta' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  return <RegisterForm next={sp.next} />;
}
