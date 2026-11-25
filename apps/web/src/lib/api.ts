import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const ACCESS_COOKIE = 'ff_at';
export const REFRESH_COOKIE = 'ff_rt';
export const WORKSPACE_COOKIE = 'ff_ws';

export function apiUrl(path: string): string {
  const base = process.env.API_URL ?? 'http://localhost:4000';
  return `${base}${path}`;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string; message?: string; fields?: { path: string; message: string }[] },
  ) {
    super(body.message ?? body.error ?? `HTTP ${status}`);
  }
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Em Server Components, token vencido leva à rota de renovação e volta para `returnTo`. */
  returnTo?: string;
  auth?: boolean;
}

/** Chamada à API a partir do servidor do Next (o navegador nunca vê os tokens). */
export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const jar = await cookies();
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.auth !== false) {
    const token = jar.get(ACCESS_COOKIE)?.value;
    if (!token) {
      if (opts.returnTo) redirect(`/renovar?next=${encodeURIComponent(opts.returnTo)}`);
      throw new ApiError(401, { error: 'unauthenticated' });
    }
    headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(apiUrl(path), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: 'no-store',
  });

  if (res.status === 401 && opts.returnTo) redirect(`/renovar?next=${encodeURIComponent(opts.returnTo)}`);
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as T & ApiError['body'];
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const secure = process.env.NODE_ENV === 'production';

/** Só funciona em Server Actions e Route Handlers (onde cookies podem ser gravados). */
export async function storeTokens(pair: TokenPair) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, pair.accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: pair.expiresIn });
  jar.set(REFRESH_COOKIE, pair.refreshToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 30 * 86400 });
}

export async function clearTokens() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/** Aceita só caminhos internos, para o `next` não virar um redirecionamento aberto. */
export function safeNext(next: string | null | undefined, fallback = '/inicio'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
