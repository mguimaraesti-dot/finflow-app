import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, apiUrl, REFRESH_COOKIE, safeNext, type TokenPair } from '@/lib/api';

/** Renova o token de acesso com o refresh token e volta para a página pedida. */
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  const toLogin = () => {
    const res = NextResponse.redirect(new URL(`/entrar?next=${encodeURIComponent(next)}`, req.url));
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    return res;
  };
  if (!refreshToken) return toLogin();

  const r = await fetch(apiUrl('/auth/refresh'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': req.headers.get('user-agent') ?? '' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  if (!r.ok) return toLogin();
  const pair = (await r.json()) as TokenPair;

  const secure = process.env.NODE_ENV === 'production';
  const res = NextResponse.redirect(new URL(next, req.url));
  res.cookies.set(ACCESS_COOKIE, pair.accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: pair.expiresIn });
  res.cookies.set(REFRESH_COOKIE, pair.refreshToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 30 * 86400 });
  return res;
}
