import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { REFRESH_COOKIE } from '@/lib/api';

export default async function Home() {
  const jar = await cookies();
  redirect(jar.get(REFRESH_COOKIE) ? '/inicio' : '/entrar');
}
