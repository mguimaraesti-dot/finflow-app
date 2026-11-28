import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';

/**
 * O Supabase Auth só é usado para o Google confirmar quem é a pessoa. A sessão do Supabase é
 * descartada logo depois; quem vale é a sessão do FinFlow (cookies ff_*).
 * GOOGLE_LOGIN=on só depois de o provedor estar configurado no painel do Supabase.
 */
export function googleLoginEnabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.GOOGLE_LOGIN === 'on');
}

export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { flowType: 'pkce' },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) jar.set(name, value, options);
      },
    },
  });
}

/** Endereço público da Web, para o Google devolver a pessoa ao lugar certo. */
export async function siteOrigin() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
