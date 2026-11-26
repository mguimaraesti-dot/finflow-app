'use server';

import {
  createTransactionSchema,
  updateTransactionSchema,
  type Repeat,
} from '@finflow/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ZodError } from 'zod';
import { api, ApiError } from '@/lib/api';
import { createPurchaseFromForm } from './card-actions';
import type { FormState } from '@/lib/types';

function fieldErrors(error: ZodError): FormState {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[issue.path.join('.')] ??= issue.message;
  return { ok: false, fields, message: 'Confira os campos destacados.' };
}

function apiFailure(e: unknown): FormState {
  if (e instanceof ApiError) {
    const fields = Object.fromEntries((e.body.fields ?? []).map((f) => [f.path, f.message]));
    return { ok: false, message: e.message, fields };
  }
  console.error(e);
  return { ok: false, message: 'Não foi possível salvar agora. Tente de novo.' };
}

function readRepeat(form: FormData): Repeat {
  const type = form.get('repeat')?.toString();
  const count = Number(form.get('repeatCount') || 0);
  if (type === 'installment') return { type, count };
  if (type === 'monthly') return count >= 2 ? { type, count } : { type };
  return { type: 'none' };
}

function str(form: FormData, key: string) {
  const v = form.get(key)?.toString().trim();
  return v ? v : undefined;
}

function monthOf(date: string | undefined) {
  return date && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : undefined;
}

export async function createTransactionAction(_: FormState, form: FormData): Promise<FormState> {
  if (form.get('method') === 'card') {
    const r = await createPurchaseFromForm(form);
    if (!r || !('cardId' in r)) return r;
    if (form.get('again') === '1') return { ok: true, message: 'Compra salva. Pode lançar a próxima.' };
    redirect(`/lancamentos?mes=${r.month}`);
  }
  const workspaceId = str(form, 'workspaceId') ?? '';
  const parsed = createTransactionSchema.safeParse({
    kind: str(form, 'kind'),
    amount: Number(form.get('amount') || 0),
    description: str(form, 'description') ?? '',
    date: str(form, 'date'),
    accountId: str(form, 'accountId'),
    categoryId: str(form, 'categoryId') ?? null,
    paid: form.get('paid') === 'on',
    ignored: form.get('ignored') === 'on',
    notes: str(form, 'notes'),
    repeat: readRepeat(form),
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    await api(`/workspaces/${workspaceId}/transactions`, {
      method: 'POST',
      body: parsed.data,
      headers: { 'idempotency-key': str(form, 'idempotencyKey') ?? crypto.randomUUID() },
    });
  } catch (e) {
    return apiFailure(e);
  }
  revalidatePath('/lancamentos');
  revalidatePath('/inicio');
  if (form.get('again') === '1') return { ok: true, message: 'Lançamento salvo. Pode lançar o próximo.' };
  redirect(`/lancamentos?mes=${monthOf(parsed.data.date) ?? ''}`);
}

export async function updateTransactionAction(_: FormState, form: FormData): Promise<FormState> {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const id = str(form, 'id') ?? '';
  const parsed = updateTransactionSchema.safeParse({
    amount: Number(form.get('amount') || 0),
    description: str(form, 'description') ?? '',
    date: str(form, 'date'),
    accountId: str(form, 'accountId'),
    categoryId: str(form, 'categoryId') ?? null,
    ignored: form.get('ignored') === 'on',
    notes: str(form, 'notes') ?? null,
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    await api(`/workspaces/${workspaceId}/transactions/${id}`, { method: 'PATCH', body: parsed.data });
  } catch (e) {
    return apiFailure(e);
  }
  revalidatePath('/lancamentos');
  revalidatePath('/inicio');
  redirect(`/lancamentos?mes=${monthOf(parsed.data.date) ?? ''}`);
}

export async function togglePaidAction(form: FormData) {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const id = str(form, 'id') ?? '';
  const paid = form.get('paid') === '1';
  await api(`/workspaces/${workspaceId}/transactions/${id}/${paid ? 'pay' : 'unpay'}`, { method: 'POST', body: {} });
  revalidatePath('/lancamentos');
  revalidatePath('/inicio');
}

export async function deleteTransactionAction(form: FormData) {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const id = str(form, 'id') ?? '';
  const scope = form.get('scope') === 'future' ? 'future' : 'this';
  const month = str(form, 'month') ?? '';
  const res = await api<{ ids: string[] }>(`/workspaces/${workspaceId}/transactions/${id}?scope=${scope}`, { method: 'DELETE' });
  revalidatePath('/lancamentos');
  revalidatePath('/inicio');
  redirect(`/lancamentos?mes=${month}&desfazer=${res.ids.join(',')}`);
}

export async function restoreTransactionsAction(form: FormData) {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const ids = (str(form, 'ids') ?? '').split(',').filter(Boolean);
  const month = str(form, 'month') ?? '';
  if (ids.length) await api(`/workspaces/${workspaceId}/transactions/restore`, { method: 'POST', body: { ids } });
  revalidatePath('/lancamentos');
  revalidatePath('/inicio');
  redirect(`/lancamentos?mes=${month}`);
}
