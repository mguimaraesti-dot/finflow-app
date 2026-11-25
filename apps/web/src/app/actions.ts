'use server';

import {
  createAccountSchema,
  createInviteSchema,
  createSharedWorkspaceSchema,
  forgotPasswordSchema,
  loginSchema,
  parseBRL,
  registerSchema,
  resetPasswordSchema,
} from '@finflow/shared';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ZodError } from 'zod';
import { api, ApiError, clearTokens, safeNext, storeTokens, WORKSPACE_COOKIE, type TokenPair } from '@/lib/api';
import type { FormState } from '@/lib/types';

function fieldErrors(error: ZodError): FormState {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[issue.path.join('.')] ??= issue.message;
  return { ok: false, fields };
}

function apiFailure(e: unknown): FormState {
  if (e instanceof ApiError) {
    const fields = Object.fromEntries((e.body.fields ?? []).map((f) => [f.path, f.message]));
    return { ok: false, message: e.status === 429 ? 'Muitas tentativas. Aguarde um minuto.' : e.message, fields };
  }
  console.error(e);
  return { ok: false, message: 'Não foi possível concluir agora. Tente de novo.' };
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    await storeTokens(await api<TokenPair>('/auth/login', { method: 'POST', body: parsed.data, auth: false }));
  } catch (e) {
    return apiFailure(e);
  }
  redirect(safeNext(form.get('next')?.toString()));
}

export async function registerAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({ name: form.get('name'), email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return fieldErrors(parsed.error);
  if (form.get('terms') !== 'on') return { ok: false, fields: { terms: 'Aceite os termos para continuar' } };
  try {
    await storeTokens(await api<TokenPair>('/auth/register', { method: 'POST', body: parsed.data, auth: false }));
  } catch (e) {
    return apiFailure(e);
  }
  redirect(safeNext(form.get('next')?.toString()));
}

export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: form.get('email') });
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    const res = await api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: parsed.data, auth: false });
    return { ok: true, message: res.message };
  } catch (e) {
    return apiFailure(e);
  }
}

export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({ token: form.get('token'), password: form.get('password') });
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    await api('/auth/reset-password', { method: 'POST', body: parsed.data, auth: false });
  } catch (e) {
    return apiFailure(e);
  }
  redirect('/entrar?senha=redefinida');
}

export async function logoutAction() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    // Sessão já inválida: segue limpando os cookies.
  }
  await clearTokens();
  redirect('/entrar');
}

export async function switchWorkspaceAction(form: FormData) {
  const id = form.get('workspaceId')?.toString() ?? '';
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    (await cookies()).set(WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 365 * 86400 });
  }
  const back = (await headers()).get('referer');
  redirect(safeNext(back ? new URL(back).pathname : null));
}

export async function createSharedWorkspaceAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = createSharedWorkspaceSchema.safeParse({ name: form.get('name') || 'Casal' });
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    const ws = await api<{ id: string }>('/workspaces', { method: 'POST', body: parsed.data });
    (await cookies()).set(WORKSPACE_COOKIE, ws.id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 365 * 86400 });
  } catch (e) {
    return apiFailure(e);
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Espaço criado. Agora convide a outra pessoa.' };
}

export async function inviteAction(_: FormState, form: FormData): Promise<FormState> {
  const workspaceId = form.get('workspaceId')?.toString() ?? '';
  const parsed = createInviteSchema.safeParse({ email: form.get('email'), role: form.get('role') || 'editor' });
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    const invite = await api<{ inviteUrl: string }>(`/workspaces/${workspaceId}/invites`, { method: 'POST', body: parsed.data });
    revalidatePath('/espacos');
    return { ok: true, message: 'Convite criado. Envie o link abaixo para a outra pessoa.', data: { inviteUrl: invite.inviteUrl } };
  } catch (e) {
    return apiFailure(e);
  }
}

export async function revokeInviteAction(form: FormData) {
  const workspaceId = form.get('workspaceId')?.toString() ?? '';
  const inviteId = form.get('inviteId')?.toString() ?? '';
  await api(`/workspaces/${workspaceId}/invites/${inviteId}`, { method: 'DELETE' });
  revalidatePath('/espacos');
}

export async function acceptInviteAction(_: FormState, form: FormData): Promise<FormState> {
  let workspaceId: string;
  try {
    const res = await api<{ workspaceId: string }>('/invites/accept', { method: 'POST', body: { token: form.get('token') } });
    workspaceId = res.workspaceId;
  } catch (e) {
    return apiFailure(e);
  }
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 365 * 86400 });
  redirect('/inicio');
}

export async function createAccountAction(_: FormState, form: FormData): Promise<FormState> {
  const workspaceId = form.get('workspaceId')?.toString() ?? '';
  const initial = parseBRL(form.get('initialBalance')?.toString() || '0');
  if (initial === null) return { ok: false, fields: { initialBalance: 'Valor inválido' } };
  const parsed = createAccountSchema.safeParse({ name: form.get('name'), type: form.get('type'), initialBalance: initial });
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    await api(`/workspaces/${workspaceId}/accounts`, { method: 'POST', body: parsed.data });
  } catch (e) {
    return apiFailure(e);
  }
  revalidatePath('/inicio');
  return { ok: true, message: 'Conta criada.' };
}
