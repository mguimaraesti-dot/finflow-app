import type { INestApplication } from '@nestjs/common';
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

async function setup(name = 'Ana') {
  const user = await registerUser(app, name);
  const ws = user.personalId;
  const a = await api(app, user).post(`/workspaces/${ws}/accounts`, { name: 'Corrente', type: 'checking', initialBalance: 100000 }).expect(201);
  const b = await api(app, user).post(`/workspaces/${ws}/accounts`, { name: 'Poupança', type: 'savings', initialBalance: 0 }).expect(201);
  const balances = async () => {
    const res = await api(app, user).get(`/workspaces/${ws}/accounts`).expect(200);
    return Object.fromEntries(res.body.map((x: { name: string; currentBalance: number }) => [x.name, x.currentBalance]));
  };
  return { user, ws, from: a.body.id as string, to: b.body.id as string, balances };
}

describe('transferências', () => {
  it('move o saldo entre contas sem virar receita nem despesa', async () => {
    const s = await setup();
    await api(app, s.user).post(`/workspaces/${s.ws}/transfers`, { fromAccountId: s.from, toAccountId: s.to, amount: 30000, date: '2026-11-10' }).expect(201);
    expect(await s.balances()).toEqual({ Corrente: 70000, Poupança: 30000 });

    const list = await api(app, s.user).get(`/workspaces/${s.ws}/transactions?month=2026-11`).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ kind: 'transfer_out', account: { name: 'Corrente' }, transfer: { to: { name: 'Poupança' } } });
    expect(list.body.summary).toMatchObject({ income: 0, expense: 0 });
  });

  it('pendente não mexe no saldo atual; editar troca valor, contas e situação', async () => {
    const s = await setup();
    const t = await api(app, s.user)
      .post(`/workspaces/${s.ws}/transfers`, { fromAccountId: s.from, toAccountId: s.to, amount: 10000, date: '2026-11-10', paid: false })
      .expect(201);
    expect(await s.balances()).toEqual({ Corrente: 100000, Poupança: 0 });

    await api(app, s.user).patch(`/workspaces/${s.ws}/transfers/${t.body.id}`, { paid: true, amount: 25000 }).expect(200);
    expect(await s.balances()).toEqual({ Corrente: 75000, Poupança: 25000 });

    await api(app, s.user).patch(`/workspaces/${s.ws}/transfers/${t.body.id}`, { fromAccountId: s.to, toAccountId: s.from }).expect(200);
    expect(await s.balances()).toEqual({ Corrente: 125000, Poupança: -25000 });

    const got = await api(app, s.user).get(`/workspaces/${s.ws}/transfers/${t.body.id}`).expect(200);
    expect(got.body).toMatchObject({ amount: 25000, paid: true, from: { name: 'Poupança' }, to: { name: 'Corrente' } });

    await api(app, s.user).patch(`/workspaces/${s.ws}/transfers/${t.body.id}`, { toAccountId: s.to }).expect(400);
  });

  it('excluir apaga as duas pernas e pode ser desfeito', async () => {
    const s = await setup();
    const t = await api(app, s.user).post(`/workspaces/${s.ws}/transfers`, { fromAccountId: s.from, toAccountId: s.to, amount: 5000, date: '2026-11-10' }).expect(201);
    const del = await api(app, s.user).delete(`/workspaces/${s.ws}/transfers/${t.body.id}`).expect(200);
    expect(del.body.deleted).toBe(2);
    expect(await s.balances()).toEqual({ Corrente: 100000, Poupança: 0 });
    await api(app, s.user).post(`/workspaces/${s.ws}/transactions/restore`, { ids: del.body.ids }).expect(201);
    expect(await s.balances()).toEqual({ Corrente: 95000, Poupança: 5000 });
  });

  it('não aceita mesma conta nem conta de outro espaço', async () => {
    const s = await setup();
    const other = await setup('Bia');
    await api(app, s.user).post(`/workspaces/${s.ws}/transfers`, { fromAccountId: s.from, toAccountId: s.from, amount: 100, date: '2026-11-10' }).expect(400);
    await api(app, s.user).post(`/workspaces/${s.ws}/transfers`, { fromAccountId: s.from, toAccountId: other.to, amount: 100, date: '2026-11-10' }).expect(400);
    const t = await api(app, s.user).post(`/workspaces/${s.ws}/transfers`, { fromAccountId: s.from, toAccountId: s.to, amount: 100, date: '2026-11-10' }).expect(201);
    await api(app, other.user).get(`/workspaces/${other.ws}/transfers/${t.body.id}`).expect(404);
    await api(app, other.user).delete(`/workspaces/${other.ws}/transfers/${t.body.id}`).expect(404);
  });

  it('a mesma chave de idempotência não duplica', async () => {
    const s = await setup();
    const send = () =>
      api(app, s.user)
        .post(`/workspaces/${s.ws}/transfers`, { fromAccountId: s.from, toAccountId: s.to, amount: 1000, date: '2026-11-10' })
        .set('Idempotency-Key', 'transf-000001');
    await send().expect(201);
    await send().expect(201);
    expect(await s.balances()).toEqual({ Corrente: 99000, Poupança: 1000 });
  });
});
