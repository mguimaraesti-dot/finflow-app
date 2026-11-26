'use server';

import { createTransferSchema, updateTransferSchema } from '@finflow/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ZodError } from 'zod';
import { api, ApiError } from '@/lib/api';
import type { FormState } from '@/lib/types';

function fieldErrors(error: ZodError): FormState {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[issue.path.join('.')] ??= issue.message;
  return { ok: false, fields, message: fields.toAccountId ?? 'Confira os campos destacados.' };
}

function apiFailure(e: unknown): FormState {
  if (e instanceof ApiError) {
    const fields = Object.fromEntries((e.body.fields ?? []).map((f) => [f.path, f.message]));
    return { ok: false, message: e.message, fields };
  }
  console.error(e);
  return { ok: false, message: 'Não foi possível salvar agora. Tente de novo.' };
}

function str(form: FormData, key: string) {
  const v = form.get(key)?.toString().trim();
  return v ? v : undefined;
}

function refresh() {
  revalidatePath('/lancamentos');
  revalidatePath('/inicio');
}

/** Chamado pelo formulário de novo lançamento quando o tipo é Transferência. */
export async function createTransferFromForm(form: FormData): Promise<FormState | { month: string }> {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const parsed = createTransferSchema.safeParse({
    fromAccountId: str(form, 'fromAccountId'),
    toAccountId: str(form, 'toAccountId'),
    amount: Number(form.get('amount') || 0),
    date: str(form, 'date'),
    description: str(form, 'description'),
    paid: form.get('paid') === 'on',
    notes: str(form, 'notes'),
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    await api(`/workspaces/${workspaceId}/transfers`, {
      method: 'POST',
      body: parsed.data,
      headers: { 'idempotency-key': str(form, 'idempotencyKey') ?? crypto.randomUUID() },
    });
  } catch (e) {
    return apiFailure(e);
  }
  refresh();
  return { month: parsed.data.date.slice(0, 7) };
}

export async function updateTransferAction(_: FormState, form: FormData): Promise<FormState> {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const id = str(form, 'id') ?? '';
  const parsed = updateTransferSchema.safeParse({
    fromAccountId: str(form, 'fromAccountId'),
    toAccountId: str(form, 'toAccountId'),
    amount: Number(form.get('amount') || 0),
    date: str(form, 'date'),
    description: str(form, 'description') ?? 'Transferência',
    paid: form.get('paid') === 'on',
    notes: str(form, 'notes') ?? null,
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    await api(`/workspaces/${workspaceId}/transfers/${id}`, { method: 'PATCH', body: parsed.data });
  } catch (e) {
    return apiFailure(e);
  }
  refresh();
  redirect(`/lancamentos?mes=${parsed.data.date?.slice(0, 7) ?? ''}`);
}

export async function deleteTransferAction(form: FormData) {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const id = str(form, 'id') ?? '';
  const month = str(form, 'month') ?? '';
  const res = await api<{ ids: string[] }>(`/workspaces/${workspaceId}/transfers/${id}`, { method: 'DELETE' });
  refresh();
  redirect(`/lancamentos?mes=${/^\d{4}-\d{2}$/.test(month) ? month : ''}&desfazer=${res.ids.join(',')}`);
}
