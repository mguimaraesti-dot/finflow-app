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

async function setup(name = 'Ana') {
  const user = await registerUser(app, name);
  const acc = await api(app, user)
    .post(`/workspaces/${user.personalId}/accounts`, { name: 'Conta', type: 'checking', initialBalance: 100000 })
    .expect(201);
  const cats = await api(app, user).get(`/workspaces/${user.personalId}/categories`).expect(200);
  const expenseCat = cats.body.find((c: { kind: string; name: string }) => c.kind === 'expense' && c.name === 'Supermercado');
  const incomeCat = cats.body.find((c: { kind: string; name: string }) => c.kind === 'income' && c.name === 'Salário');
  return { user, ws: user.personalId, accountId: acc.body.id as string, expenseCat: expenseCat.id as string, incomeCat: incomeCat.id as string };
}

const tx = (user: TestUser, ws: string) => ({
  create: (body: object) => api(app, user).post(`/workspaces/${ws}/transactions`, body),
  list: (month: string) => api(app, user).get(`/workspaces/${ws}/transactions?month=${month}`),
  balance: async () => {
    const res = await api(app, user).get(`/workspaces/${ws}/accounts`).expect(200);
    return { current: res.body[0].currentBalance as number, projected: res.body[0].projectedBalance as number };
  },
});

describe('lançamentos em conta', () => {
  it('despesa paga baixa o saldo atual; pendente só o previsto', async () => {
    const s = await setup();
    const t = tx(s.user, s.ws);
    await t.create({ kind: 'expense', amount: 18640, description: 'Mercado', date: '2026-11-25', accountId: s.accountId, categoryId: s.expenseCat, paid: true }).expect(201);
    await t.create({ kind: 'expense', amount: 210000, description: 'Aluguel', date: '2026-11-28', accountId: s.accountId, paid: false }).expect(201);
    await t.create({ kind: 'income', amount: 650000, description: 'Salário', date: '2026-11-05', accountId: s.accountId, categoryId: s.incomeCat, paid: true }).expect(201);

    expect(await t.balance()).toEqual({ current: 100000 - 18640 + 650000, projected: 100000 - 18640 - 210000 + 650000 });

    const res = await t.list('2026-11').expect(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.summary).toMatchObject({ income: 650000, expense: 228640, result: 421360, pendingCount: 1 });
    expect(res.body.items[0].createdBy.name).toBe('Ana');
  });

  it('pagar e desfazer pagamento movem o saldo atual', async () => {
    const s = await setup();
    const t = tx(s.user, s.ws);
    const c = await t.create({ kind: 'expense', amount: 5000, description: 'Farmácia', date: '2026-11-20', accountId: s.accountId }).expect(201);
    await api(app, s.user).post(`/workspaces/${s.ws}/transactions/${c.body.id}/pay`, { paidAt: '2026-11-21' }).expect(201);
    expect((await t.balance()).current).toBe(95000);
    await api(app, s.user).post(`/workspaces/${s.ws}/transactions/${c.body.id}/unpay`).expect(201);
    expect((await t.balance()).current).toBe(100000);
  });

  it('lançamento ignorado não entra no saldo nem no resumo', async () => {
    const s = await setup();
    const t = tx(s.user, s.ws);
    await t.create({ kind: 'expense', amount: 9000, description: 'Reembolso', date: '2026-11-10', accountId: s.accountId, paid: true, ignored: true }).expect(201);
    expect((await t.balance()).current).toBe(100000);
    const res = await t.list('2026-11').expect(200);
    expect(res.body.summary.expense).toBe(0);
    expect(res.body.items[0].ignored).toBe(true);
  });

  it('parcelado cria N lançamentos que somam o total, um por mês', async () => {
    const s = await setup();
    const t = tx(s.user, s.ws);
    await t.create({ kind: 'expense', amount: 100000, description: 'Geladeira', date: '2026-01-31', accountId: s.accountId, repeat: { type: 'installment', count: 3 } }).expect(201);
    const feb = await t.list('2026-02').expect(200);
    expect(feb.body.items[0]).toMatchObject({ date: '2026-02-28', amount: 33333, series: { type: 'installment', number: 2, total: 3 } });
    const rows = await owner.transaction.findMany({ where: { workspaceId: s.ws } });
    expect(rows.reduce((sum, r) => sum + Number(r.amountCents), 0)).toBe(100000);
  });

  it('recorrência sem fim aparece em qualquer mês futuro e "excluir esta e as próximas" encerra', async () => {
    const s = await setup();
    const t = tx(s.user, s.ws);
    const c = await t.create({ kind: 'expense', amount: 12990, description: 'Academia', date: '2026-11-30', accountId: s.accountId, repeat: { type: 'monthly' } }).expect(201);
    expect(c.body.count).toBe(12);

    // Dois anos à frente: a série se estende sozinha.
    const far = await t.list('2028-11').expect(200);
    expect(far.body.items.map((i: { description: string; date: string }) => [i.description, i.date])).toEqual([['Academia', '2028-11-30']]);

    const feb = await t.list('2027-02').expect(200);
    expect(feb.body.items[0].date).toBe('2027-02-28');
    await api(app, s.user).delete(`/workspaces/${s.ws}/transactions/${feb.body.items[0].id}?scope=future`).expect(200);

    expect((await t.list('2027-01').expect(200)).body.items).toHaveLength(1);
    expect((await t.list('2027-02').expect(200)).body.items).toHaveLength(0);
    expect((await t.list('2029-06').expect(200)).body.items).toHaveLength(0);
  });

  it('excluir uma ocorrência não a recria e pode ser desfeito', async () => {
    const s = await setup();
    const t = tx(s.user, s.ws);
    await t.create({ kind: 'expense', amount: 5000, description: 'Streaming', date: '2026-11-15', accountId: s.accountId, repeat: { type: 'monthly' } }).expect(201);
    const dec = await t.list('2026-12').expect(200);
    const del = await api(app, s.user).delete(`/workspaces/${s.ws}/transactions/${dec.body.items[0].id}`).expect(200);
    await t.list('2028-01').expect(200); // força extensão da série
    expect((await t.list('2026-12').expect(200)).body.items).toHaveLength(0);

    await api(app, s.user).post(`/workspaces/${s.ws}/transactions/restore`, { ids: del.body.ids }).expect(201);
    expect((await t.list('2026-12').expect(200)).body.items).toHaveLength(1);
  });

  it('edita valor e categoria, e registra auditoria', async () => {
    const s = await setup();
    const t = tx(s.user, s.ws);
    const c = await t.create({ kind: 'expense', amount: 1000, description: 'Pão', date: '2026-11-26', accountId: s.accountId, paid: true }).expect(201);
    await api(app, s.user).patch(`/workspaces/${s.ws}/transactions/${c.body.id}`, { amount: 1500, categoryId: s.expenseCat }).expect(200);
    const got = await api(app, s.user).get(`/workspaces/${s.ws}/transactions/${c.body.id}`).expect(200);
    expect(got.body).toMatchObject({ amount: 1500, category: { id: s.expenseCat } });
    expect((await t.balance()).current).toBe(98500);
    expect(await owner.auditLog.count({ where: { entity: 'transaction', entityId: c.body.id } })).toBe(2);
  });

  it('recusa categoria de receita numa despesa e conta de outro espaço', async () => {
    const s = await setup('Ana');
    const other = await setup('Bruno');
    const t = tx(s.user, s.ws);
    const r1 = await t.create({ kind: 'expense', amount: 1000, description: 'X', date: '2026-11-26', accountId: s.accountId, categoryId: s.incomeCat }).expect(400);
    expect(r1.body.error).toBe('category_kind_mismatch');
    const r2 = await t.create({ kind: 'expense', amount: 1000, description: 'X', date: '2026-11-26', accountId: other.accountId }).expect(400);
    expect(r2.body.error).toBe('invalid_account');
    await tx(other.user, s.ws).list('2026-11').expect(404);
  });

  it('mesmo Idempotency-Key não lança duas vezes', async () => {
    const s = await setup();
    const body = { kind: 'expense', amount: 4200, description: 'Padaria', date: '2026-11-26', accountId: s.accountId };
    const first = await api(app, s.user).post(`/workspaces/${s.ws}/transactions`, body).set('Idempotency-Key', 'tela-novo-abc123').expect(201);
    const again = await api(app, s.user).post(`/workspaces/${s.ws}/transactions`, body).set('Idempotency-Key', 'tela-novo-abc123').expect(201);
    expect(again.body.id).toBe(first.body.id);
    expect(await owner.transaction.count({ where: { workspaceId: s.ws } })).toBe(1);
    await api(app, s.user).post(`/workspaces/${s.ws}/transactions`, { ...body, amount: 1 }).set('Idempotency-Key', 'tela-novo-abc123').expect(409);
  });
});
