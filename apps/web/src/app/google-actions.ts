'use server';

import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/api';
import { googleLoginEnabled, siteOrigin, supabaseServer } from '@/lib/supabase';

export async function googleSignInAction(form: FormData) {
  if (!googleLoginEnabled()) redirect('/entrar?erro=google');
  const next = safeNext(form.get('next')?.toString());
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error || !data.url) {
    console.error('[google] signInWithOAuth', error?.code, error?.message);
    redirect('/entrar?erro=google');
  }
  redirect(data.url);
}
