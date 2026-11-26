import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, appRole, owner, registerUser, resetDatabase, startApp, type TestUser } from './helpers';

let app: INestApplication;

beforeAll(async () => {
  ({ app } = await startApp());
});
beforeEach(resetDatabase);
afterAll(async () => {
  await app.close();
  await owner.$disconnect();
  await appRole.$disconnect();
});

// Datas em 2030 para não depender de "hoje": todas as faturas aqui são futuras.
async function setup(name = 'Ana') {
  const user = await registerUser(app, name);
  const ws = user.personalId;
  const acc = await api(app, user).post(`/workspaces/${ws}/accounts`, { name: 'Conta', type: 'checking', initialBalance: 100000 }).expect(201);
  const card = await api(app, user)
    .post(`/workspaces/${ws}/cards`, { name: 'Roxinho', brand: 'mastercard', limit: 100000, closingDay: 20, dueDay: 1, paymentAccountId: acc.body.id })
    .expect(201);
  const cats = await api(app, user).get(`/workspaces/${ws}/categories`).expect(200);
  const cat = (kind: string) => cats.body.find((c: { kind: string }) => c.kind === kind).id as string;
  return { user, ws, accountId: acc.body.id as string, cardId: card.body.id as string, expenseCat: cat('expense'), incomeCat: cat('income') };
}

type S = Awaited<ReturnType<typeof setup>>;
const c = (s: S, user: TestUser = s.user) => ({
  buy: (body: object) => api(app, user).post(`/workspaces/${s.ws}/cards/${s.cardId}/purchases`, body),
  invoice: (month: string) => api(app, user).get(`/workspaces/${s.ws}/cards/${s.cardId}/invoice?month=${month}`),
  card: async () => {
    const res = await api(app, user).get(`/workspaces/${s.ws}/cards`).expect(200);
    return res.body[0];
  },
  pay: (month: string, amount: number) =>
    api(app, user).post(`/workspaces/${s.ws}/cards/${s.cardId}/invoices/${month}/pay`, { amount, accountId: s.accountId, date: '2030-04-01' }),
  balance: async () => {
    const res = await api(app, user).get(`/workspaces/${s.ws}/accounts`).expect(200);
    return res.body[0].currentBalance as number;
  },
});

describe('cartões e faturas', () => {
  it('compra parcelada vai uma parcela por fatura e consome o limite inteiro', async () => {
    const s = await setup();
    await c(s).buy({ amount: 30001, description: 'Fone', date: '2030-03-10', installments: 3, categoryId: s.expenseCat }).expect(201);

    const abr = await c(s).invoice('2030-04').expect(200);
    expect(abr.body.invoice).toMatchObject({ closingDate: '2030-03-20', dueDate: '2030-04-01', total: 10001, paid: 0 });
    expect(abr.body.items[0]).toMatchObject({ description: 'Fone', installment: { number: 1, total: 3 }, date: '2030-03-10' });
    expect((await c(s).invoice('2030-05').expect(200)).body.invoice.total).toBe(10000);
    expect((await c(s).invoice('2030-06').expect(200)).body.invoice.total).toBe(10000);
    expect((await c(s).invoice('2030-07').expect(200)).body).toMatchObject({ invoice: { id: null, total: 0 }, items: [] });

    const card = await c(s).card();
    expect(card).toMatchObject({ used: 30001, available: 100000 - 30001 });
  });

  it('compra no dia do fechamento cai na fatura seguinte', async () => {
    const s = await setup();
    await c(s).buy({ amount: 5000, description: 'Livro', date: '2030-03-20' }).expect(201);
    expect((await c(s).invoice('2030-04').expect(200)).body.invoice.total).toBe(0);
    expect((await c(s).invoice('2030-05').expect(200)).body.invoice.total).toBe(5000);
  });

  it('pagamento parcial e total: tira da conta, libera limite, não passa do saldo', async () => {
    const s = await setup();
    await c(s).buy({ amount: 10000, description: 'Mercado', date: '2030-03-10' }).expect(201);

    await c(s).pay('2030-04', 4000).expect(201);
    expect(await c(s).balance()).toBe(96000);
    expect((await c(s).invoice('2030-04')).body.invoice).toMatchObject({ paid: 4000, remaining: 6000 });
    expect((await c(s).card()).used).toBe(6000);

    const over = await c(s).pay('2030-04', 7000).expect(400);
    expect(over.body.error).toBe('amount_exceeds_remaining');

    const last = await c(s).pay('2030-04', 6000).expect(201);
    expect((await c(s).invoice('2030-04')).body.invoice).toMatchObject({ remaining: 0, status: 'paid' });
    expect((await c(s).card()).used).toBe(0);
    await c(s).pay('2030-04', 100).expect(400);

    await api(app, s.user).delete(`/workspaces/${s.ws}/cards/${s.cardId}/payments/${last.body.id}`).expect(200);
    expect(await c(s).balance()).toBe(96000);
    expect((await c(s).invoice('2030-04')).body.invoice.remaining).toBe(6000);
  });

  it('lançamentos do mês mostram a compra como despesa e o pagamento sem contar em dobro', async () => {
    const s = await setup();
    await c(s).buy({ amount: 10000, description: 'Mercado', date: '2030-03-10' }).expect(201);
    await c(s).pay('2030-04', 10000).expect(201);

    const mar = await api(app, s.user).get(`/workspaces/${s.ws}/transactions?month=2030-03`).expect(200);
    expect(mar.body.items[0]).toMatchObject({ kind: 'expense', card: { name: 'Roxinho' }, account: null, invoice: { month: '2030-04' } });
    expect(mar.body.summary).toMatchObject({ expense: 10000, expensePaid: 0, pendingCount: 0 });

    const abr = await api(app, s.user).get(`/workspaces/${s.ws}/transactions?month=2030-04`).expect(200);
    expect(abr.body.items[0]).toMatchObject({ kind: 'invoice_payment', amount: 10000, account: { name: 'Conta' } });
    expect(abr.body.summary.expense).toBe(0);
  });

  it('estorno abate da fatura', async () => {
    const s = await setup();
    await c(s).buy({ amount: 10000, description: 'Tênis', date: '2030-03-10' }).expect(201);
    await c(s).buy({ kind: 'income', amount: 2500, description: 'Estorno tênis', date: '2030-03-12', categoryId: s.incomeCat }).expect(201);
    expect((await c(s).invoice('2030-04')).body.invoice.total).toBe(7500);
  });

  it('editar descrição vale para todas as parcelas; editar valor refaz as parcelas', async () => {
    const s = await setup();
    const p = await c(s).buy({ amount: 20000, description: 'TV', date: '2030-03-10', installments: 2 }).expect(201);
    const purchase = api(app, s.user);

    await purchase.patch(`/workspaces/${s.ws}/purchases/${p.body.id}`, { description: 'Televisão' }).expect(200);
    expect((await c(s).invoice('2030-05')).body.items[0].description).toBe('Televisão');

    const upd = await purchase.patch(`/workspaces/${s.ws}/purchases/${p.body.id}`, { amount: 30000, installments: 3 }).expect(200);
    expect(upd.body.id).not.toBe(p.body.id);
    const got = await purchase.get(`/workspaces/${s.ws}/purchases/${upd.body.id}`).expect(200);
    expect(got.body).toMatchObject({ amount: 30000, installments: 3, description: 'Televisão', date: '2030-03-10' });
    expect((await c(s).invoice('2030-06')).body.invoice.total).toBe(10000);
    await purchase.get(`/workspaces/${s.ws}/purchases/${p.body.id}`).expect(404);
  });

  it('excluir apaga todas as parcelas e pode ser desfeito', async () => {
    const s = await setup();
    const p = await c(s).buy({ amount: 20000, description: 'TV', date: '2030-03-10', installments: 2 }).expect(201);
    const del = await api(app, s.user).delete(`/workspaces/${s.ws}/purchases/${p.body.id}`).expect(200);
    expect(del.body.deleted).toBe(2);
    expect((await c(s).card()).used).toBe(0);
    await api(app, s.user).post(`/workspaces/${s.ws}/transactions/restore`, { ids: del.body.ids }).expect(201);
    expect((await c(s).card()).used).toBe(20000);
  });

  it('a mesma chave de idempotência não duplica a compra', async () => {
    const s = await setup();
    const body = { amount: 1000, description: 'Café', date: '2030-03-10' };
    const key = 'compra-cafe-0001';
    const send = () => api(app, s.user).post(`/workspaces/${s.ws}/cards/${s.cardId}/purchases`, body).set('Idempotency-Key', key);
    const a = await send().expect(201);
    const b = await send().expect(201);
    expect(b.body.id).toBe(a.body.id);
    expect((await c(s).card()).used).toBe(1000);
  });

  it('valida categoria e conta do próprio espaço', async () => {
    const s = await setup();
    const other = await setup('Bia');
    const r = await c(s).buy({ amount: 1000, description: 'X', date: '2030-03-10', categoryId: s.incomeCat }).expect(400);
    expect(r.body.error).toBe('category_kind_mismatch');
    await api(app, s.user)
      .post(`/workspaces/${s.ws}/cards`, { name: 'X', brand: 'visa', limit: 0, closingDay: 1, dueDay: 8, paymentAccountId: other.accountId })
      .expect(400);
  });

  it('outra pessoa não vê nem usa o cartão', async () => {
    const s = await setup();
    const p = await c(s).buy({ amount: 1000, description: 'Café', date: '2030-03-10' }).expect(201);
    const bia = await registerUser(app, 'Bia');
    await api(app, bia).get(`/workspaces/${s.ws}/cards`).expect(404);
    await api(app, bia).get(`/workspaces/${bia.personalId}/purchases/${p.body.id}`).expect(404);
    await api(app, bia).get(`/workspaces/${bia.personalId}/cards/${s.cardId}/invoice`).expect(404);
    await api(app, bia).delete(`/workspaces/${bia.personalId}/purchases/${p.body.id}`).expect(404);
  });

  it('arquivar tira o cartão da lista', async () => {
    const s = await setup();
    await api(app, s.user).post(`/workspaces/${s.ws}/cards/${s.cardId}/archive`).expect(201);
    expect((await api(app, s.user).get(`/workspaces/${s.ws}/cards`).expect(200)).body).toHaveLength(0);
    await c(s).buy({ amount: 1000, description: 'Café', date: '2030-03-10' }).expect(404);
  });
});
