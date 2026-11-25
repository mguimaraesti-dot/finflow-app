import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetForm } from '../forms';

export const metadata: Metadata = { title: 'Nova senha' };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <p className="rounded-[20px] bg-surface p-6 text-[15px]">
        Link incompleto. <Link href="/esqueci-senha" className="font-semibold text-brand">Peça um novo</Link>.
      </p>
    );
  }
  return <ResetForm token={token} />;
}
