import type { INestApplication } from '@nestjs/common';
import { addDays, todayIn } from '@finflow/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, appRole, owner, registerUser, resetDatabase, startApp } from './helpers';

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

describe('contas a pagar e a receber', () => {
  it('traz pendentes atrasados e do período, faturas em aberto, e nada pago, ignorado ou distante', async () => {
    const user = await registerUser(app, 'Ana');
    const ws = user.personalId;
    const today = todayIn('America/Sao_Paulo');
    const acc = await api(app, user).post(`/workspaces/${ws}/accounts`, { name: 'Conta', type: 'checking' }).expect(201);
    const t = (body: object) =>
      api(app, user).post(`/workspaces/${ws}/transactions`, { kind: 'expense', amount: 1000, accountId: acc.body.id, paid: false, ...body }).expect(201);

    await t({ description: 'Atrasada', date: addDays(today, -40) });
    await t({ description: 'Daqui a 10 dias', date: addDays(today, 10) });
    await t({ kind: 'income', description: 'Salário', date: addDays(today, 5) });
    await t({ description: 'Paga', date: addDays(today, 3), paid: true });
    await t({ description: 'Ignorada', date: addDays(today, 3), ignored: true });
    await t({ description: 'Longe', date: addDays(today, 90) });

    const card = await api(app, user)
      .post(`/workspaces/${ws}/cards`, { name: 'Roxinho', brand: 'visa', limit: 100000, closingDay: 1, dueDay: 10, paymentAccountId: acc.body.id })
      .expect(201);
    await api(app, user).post(`/workspaces/${ws}/cards/${card.body.id}/purchases`, { amount: 5000, description: 'Mercado', date: today }).expect(201);

    const res = await api(app, user).get(`/workspaces/${ws}/bills?days=60`).expect(200);
    expect(res.body.items.map((i: { description: string }) => i.description)).toEqual(['Atrasada', 'Salário', 'Daqui a 10 dias']);
    expect(res.body.invoices).toHaveLength(1);
    expect(res.body.invoices[0]).toMatchObject({ cardName: 'Roxinho', remaining: 5000 });

    const short = await api(app, user).get(`/workspaces/${ws}/bills?days=7`).expect(200);
    expect(short.body.items.map((i: { description: string }) => i.description)).toEqual(['Atrasada', 'Salário']);

    await api(app, user).get(`/workspaces/${ws}/bills?days=abc`).expect(400);
    const bia = await registerUser(app, 'Bia');
    await api(app, bia).get(`/workspaces/${ws}/bills`).expect(404);
  });
});
