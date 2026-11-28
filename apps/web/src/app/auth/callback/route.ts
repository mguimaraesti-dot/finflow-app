import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { api, ApiError, safeNext, storeTokens, type TokenPair } from '@/lib/api';
import { googleLoginEnabled, supabaseServer } from '@/lib/supabase';

// Volta do Google: troca o código pela sessão do Supabase, valida na API e grava a sessão do FinFlow.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = safeNext(request.nextUrl.searchParams.get('next'));
  if (!code || !googleLoginEnabled()) redirect('/entrar?erro=google');

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    console.error('[google] exchangeCodeForSession', error?.code, error?.message);
    redirect('/entrar?erro=google');
  }

  let failure: string | null = null;
  try {
    const pair = await api<TokenPair>('/auth/google', {
      method: 'POST',
      auth: false,
      body: { accessToken: data.session.access_token },
    });
    await storeTokens(pair);
  } catch (e) {
    failure = e instanceof ApiError && e.body.error === 'email_not_verified' ? 'email' : 'google';
    if (!(e instanceof ApiError)) console.error('[google] /auth/google', e);
  }
  // A sessão do Supabase não é usada depois daqui.
  const { error: outError } = await supabase.auth.signOut({ scope: 'local' });
  if (outError) console.error('[google] signOut', outError.code, outError.message);

  redirect(failure ? `/entrar?erro=${failure}` : next);
}
