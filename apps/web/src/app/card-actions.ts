'use server';

import {
  createCardPurchaseSchema,
  createCardSchema,
  payInvoiceSchema,
  updateCardPurchaseSchema,
  updateCardSchema,
} from '@finflow/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ZodError } from 'zod';
import { api, ApiError } from '@/lib/api';
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

function str(form: FormData, key: string) {
  const v = form.get(key)?.toString().trim();
  return v ? v : undefined;
}

const num = (form: FormData, key: string) => (form.get(key) ? Number(form.get(key)) : undefined);
const month = (s: string) => (/^\d{4}-\d{2}$/.test(s) ? s : '');

function refresh() {
  revalidatePath('/cartoes', 'layout');
  revalidatePath('/a-pagar');
  revalidatePath('/lancamentos');
  revalidatePath('/inicio');
}

function readCard(form: FormData) {
  return {
    name: str(form, 'name') ?? '',
    brand: str(form, 'brand'),
    limit: num(form, 'limit') ?? 0,
    closingDay: num(form, 'closingDay'),
    dueDay: num(form, 'dueDay'),
    paymentAccountId: str(form, 'paymentAccountId'),
  };
}

export async function createCardAction(_: FormState, form: FormData): Promise<FormState> {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const parsed = createCardSchema.safeParse(readCard(form));
  if (!parsed.success) return fieldErrors(parsed.error);
  let id: string;
  try {
    ({ id } = await api<{ id: string }>(`/workspaces/${workspaceId}/cards`, { method: 'POST', body: parsed.data }));
  } catch (e) {
    return apiFailure(e);
  }
  refresh();
  redirect(`/cartoes/${id}`);
}

export async function updateCardAction(_: FormState, form: FormData): Promise<FormState> {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const id = str(form, 'id') ?? '';
  const parsed = updateCardSchema.safeParse(readCard(form));
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    await api(`/workspaces/${workspaceId}/cards/${id}`, { method: 'PATCH', body: parsed.data });
  } catch (e) {
    return apiFailure(e);
  }
  refresh();
  return { ok: true, message: 'Cartão atualizado.' };
}

export async function archiveCardAction(form: FormData) {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const id = str(form, 'id') ?? '';
  await api(`/workspaces/${workspaceId}/cards/${id}/archive`, { method: 'POST', body: {} });
  refresh();
  redirect('/cartoes');
}

/** Compra no cartão vinda do formulário de novo lançamento. */
export async function createPurchaseFromForm(form: FormData): Promise<FormState | { cardId: string; month: string }> {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const cardId = str(form, 'cardId');
  if (!cardId) return { ok: false, message: 'Escolha o cartão.', fields: { cardId: 'Escolha o cartão' } };
  const parsed = createCardPurchaseSchema.safeParse({
    kind: 'expense',
    amount: Number(form.get('amount') || 0),
    description: str(form, 'description') ?? '',
    date: str(form, 'date'),
    categoryId: str(form, 'categoryId') ?? null,
    installments: num(form, 'installments') ?? 1,
    notes: str(form, 'notes'),
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    await api(`/workspaces/${workspaceId}/cards/${cardId}/purchases`, {
      method: 'POST',
      body: parsed.data,
      headers: { 'idempotency-key': str(form, 'idempotencyKey') ?? crypto.randomUUID() },
    });
  } catch (e) {
    return apiFailure(e);
  }
  refresh();
  return { cardId, month: parsed.data.date.slice(0, 7) };
}

export async function updatePurchaseAction(_: FormState, form: FormData): Promise<FormState> {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const id = str(form, 'id') ?? '';
  const parsed = updateCardPurchaseSchema.safeParse({
    amount: Number(form.get('amount') || 0),
    description: str(form, 'description') ?? '',
    date: str(form, 'date'),
    categoryId: str(form, 'categoryId') ?? null,
    installments: num(form, 'installments') ?? 1,
    notes: str(form, 'notes') ?? null,
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    await api(`/workspaces/${workspaceId}/purchases/${id}`, { method: 'PATCH', body: parsed.data });
  } catch (e) {
    return apiFailure(e);
  }
  refresh();
  redirect(`/cartoes/${str(form, 'cardId') ?? ''}?mes=${month(str(form, 'back') ?? '')}`);
}

export async function deletePurchaseAction(form: FormData) {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const id = str(form, 'id') ?? '';
  const res = await api<{ ids: string[] }>(`/workspaces/${workspaceId}/purchases/${id}`, { method: 'DELETE' });
  refresh();
  redirect(`/cartoes/${str(form, 'cardId') ?? ''}?mes=${month(str(form, 'back') ?? '')}&desfazer=${res.ids.join(',')}`);
}

export async function restorePurchaseAction(form: FormData) {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const ids = (str(form, 'ids') ?? '').split(',').filter(Boolean);
  if (ids.length) await api(`/workspaces/${workspaceId}/transactions/restore`, { method: 'POST', body: { ids } });
  refresh();
  redirect(`/cartoes/${str(form, 'cardId') ?? ''}?mes=${month(str(form, 'back') ?? '')}`);
}

export async function payInvoiceAction(_: FormState, form: FormData): Promise<FormState> {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const cardId = str(form, 'cardId') ?? '';
  const m = month(str(form, 'month') ?? '');
  const parsed = payInvoiceSchema.safeParse({
    amount: Number(form.get('amount') || 0),
    accountId: str(form, 'accountId'),
    date: str(form, 'date'),
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  try {
    await api(`/workspaces/${workspaceId}/cards/${cardId}/invoices/${m}/pay`, {
      method: 'POST',
      body: parsed.data,
      headers: { 'idempotency-key': str(form, 'idempotencyKey') ?? crypto.randomUUID() },
    });
  } catch (e) {
    return apiFailure(e);
  }
  refresh();
  return { ok: true, message: 'Pagamento registrado.' };
}

export async function removePaymentAction(form: FormData) {
  const workspaceId = str(form, 'workspaceId') ?? '';
  const cardId = str(form, 'cardId') ?? '';
  const paymentId = str(form, 'paymentId') ?? '';
  await api(`/workspaces/${workspaceId}/cards/${cardId}/payments/${paymentId}`, { method: 'DELETE' });
  refresh();
}
