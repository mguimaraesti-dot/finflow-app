import type { INestApplication } from '@nestjs/common';
import { withUser } from '@finflow/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, appRole, owner, registerUser, resetDatabase, startApp, tokenFromUrl, type TestUser } from './helpers';

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

function createAccount(user: TestUser, workspaceId: string, name: string) {
  return api(app, user).post(`/workspaces/${workspaceId}/accounts`, { name, type: 'checking', initialBalance: 100000 });
}

async function createCouple(a: TestUser, b: TestUser) {
  const ws = await api(app, a).post('/workspaces', { name: 'Casal' }).expect(201);
  const invite = await api(app, a).post(`/workspaces/${ws.body.id}/invites`, { email: b.email }).expect(201);
  await api(app, b).post('/invites/accept', { token: tokenFromUrl(invite.body.inviteUrl) }).expect(200);
  return ws.body.id as string;
}

describe('espaço Pessoal é só da pessoa', () => {
  it('outra pessoa não lê nem escreve no espaço Pessoal alheio (404, sem revelar que existe)', async () => {
    const ana = await registerUser(app, 'Ana');
    const bruno = await registerUser(app, 'Bruno');
    await createAccount(ana, ana.personalId, 'Conta da Ana').expect(201);

    await api(app, bruno).get(`/workspaces/${ana.personalId}/accounts`).expect(404);
    await createAccount(bruno, ana.personalId, 'Invasão').expect(404);

    const brunoSpaces = await api(app, bruno).get('/workspaces').expect(200);
    expect(brunoSpaces.body.map((w: { id: string }) => w.id)).toEqual([bruno.personalId]);
  });

  it('não aceita convite no espaço Pessoal', async () => {
    const ana = await registerUser(app, 'Ana');
    const res = await api(app, ana).post(`/workspaces/${ana.personalId}/invites`, { email: 'x@exemplo.com' }).expect(400);
    expect(res.body.error).toBe('personal_workspace');
  });
});

describe('espaço Casal', () => {
  it('convite aceito dá acesso ao Casal e nada mais', async () => {
    const ana = await registerUser(app, 'Ana');
    const bruno = await registerUser(app, 'Bruno');
    await createAccount(ana, ana.personalId, 'Conta da Ana').expect(201);

    const coupleId = await createCouple(ana, bruno);
    await createAccount(bruno, coupleId, 'Conta conjunta').expect(201);

    const seenByAna = await api(app, ana).get(`/workspaces/${coupleId}/accounts`).expect(200);
    expect(seenByAna.body.map((a: { name: string }) => a.name)).toEqual(['Conta conjunta']);
    expect(seenByAna.body[0].currentBalance).toBe(100000);

    await api(app, bruno).get(`/workspaces/${ana.personalId}/accounts`).expect(404);

    const brunoSpaces = await api(app, bruno).get('/workspaces').expect(200);
    expect(brunoSpaces.body.map((w: { type: string }) => w.type).sort()).toEqual(['personal', 'shared']);
    const couple = brunoSpaces.body.find((w: { type: string }) => w.type === 'shared');
    expect(couple.members).toHaveLength(2);
    expect(couple.role).toBe('editor');
  });

  it('mostra a prévia do convite antes de aceitar', async () => {
    const ana = await registerUser(app, 'Ana');
    const bruno = await registerUser(app, 'Bruno');
    const ws = await api(app, ana).post('/workspaces', { name: 'Casa nova' }).expect(201);
    const invite = await api(app, ana).post(`/workspaces/${ws.body.id}/invites`, { email: bruno.email }).expect(201);
    const preview = await api(app, bruno).post('/invites/preview', { token: tokenFromUrl(invite.body.inviteUrl) }).expect(200);
    expect(preview.body).toMatchObject({ workspaceName: 'Casa nova', status: 'pending', email: bruno.email });
  });

  it('convite só vale para o e-mail convidado, uma vez, e o Casal tem no máximo duas pessoas', async () => {
    const ana = await registerUser(app, 'Ana');
    const bruno = await registerUser(app, 'Bruno');
    const carla = await registerUser(app, 'Carla');
    const ws = await api(app, ana).post('/workspaces', { name: 'Casal' }).expect(201);
    const invite = await api(app, ana).post(`/workspaces/${ws.body.id}/invites`, { email: bruno.email }).expect(201);
    const token = tokenFromUrl(invite.body.inviteUrl);

    await api(app, carla).post('/invites/accept', { token }).expect(403);
    await api(app, bruno).post('/invites/accept', { token }).expect(200);
    await api(app, bruno).post('/invites/accept', { token }).expect(404);

    const full = await api(app, ana).post(`/workspaces/${ws.body.id}/invites`, { email: carla.email }).expect(409);
    expect(full.body.error).toBe('workspace_full');
  });

  it('só o dono convida e um convite revogado deixa de valer', async () => {
    const ana = await registerUser(app, 'Ana');
    const bruno = await registerUser(app, 'Bruno');
    const carla = await registerUser(app, 'Carla');
    const coupleId = await createCouple(ana, bruno);
    await api(app, bruno).post(`/workspaces/${coupleId}/invites`, { email: carla.email }).expect(403);

    const ws2 = await api(app, ana).post('/workspaces', { name: 'Viagem' }).expect(201);
    const invite = await api(app, ana).post(`/workspaces/${ws2.body.id}/invites`, { email: carla.email }).expect(201);
    await api(app, ana).delete(`/workspaces/${ws2.body.id}/invites/${invite.body.id}`).expect(204);
    await api(app, carla).post('/invites/accept', { token: tokenFromUrl(invite.body.inviteUrl) }).expect(404);
  });

  it('quem tem acesso de leitura não escreve', async () => {
    const ana = await registerUser(app, 'Ana');
    const bruno = await registerUser(app, 'Bruno');
    const ws = await api(app, ana).post('/workspaces', { name: 'Casal' }).expect(201);
    const invite = await api(app, ana).post(`/workspaces/${ws.body.id}/invites`, { email: bruno.email, role: 'viewer' }).expect(201);
    await api(app, bruno).post('/invites/accept', { token: tokenFromUrl(invite.body.inviteUrl) }).expect(200);

    await api(app, bruno).get(`/workspaces/${ws.body.id}/accounts`).expect(200);
    await createAccount(bruno, ws.body.id, 'Não pode').expect(403);
  });

  it('quem sai do Casal perde o acesso na hora', async () => {
    const ana = await registerUser(app, 'Ana');
    const bruno = await registerUser(app, 'Bruno');
    const coupleId = await createCouple(ana, bruno);
    await api(app, bruno).delete(`/workspaces/${coupleId}/members/${bruno.id}`).expect(204);
    await api(app, bruno).get(`/workspaces/${coupleId}/accounts`).expect(404);
  });
});

describe('Row-Level Security no próprio banco', () => {
  it('toda tabela com workspace_id tem RLS ligado', async () => {
    const rows = await owner.$queryRaw<{ table_name: string; rls: boolean }[]>`
      SELECT c.table_name, cl.relrowsecurity AS rls
      FROM information_schema.columns c
      JOIN pg_class cl ON cl.relname = c.table_name AND cl.relkind = 'r'
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      WHERE c.table_schema = 'public' AND c.column_name = 'workspace_id'`;
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(rows.filter((r) => !r.rls).map((r) => r.table_name)).toEqual([]);
  });

  it('sem usuário na transação, o papel da aplicação não enxerga nada', async () => {
    const ana = await registerUser(app, 'Ana');
    await createAccount(ana, ana.personalId, 'Conta da Ana').expect(201);
    expect(await appRole.account.count()).toBe(0);
    expect(await appRole.workspace.count()).toBe(0);
    expect(await appRole.category.count()).toBe(0);
  });

  it('com outro usuário na transação, os dados alheios somem e não podem ser gravados', async () => {
    const ana = await registerUser(app, 'Ana');
    const bruno = await registerUser(app, 'Bruno');
    await createAccount(ana, ana.personalId, 'Conta da Ana').expect(201);

    const seen = await withUser(appRole, bruno.id, (tx) => tx.account.findMany());
    expect(seen).toEqual([]);

    await expect(
      withUser(appRole, bruno.id, (tx) =>
        tx.account.create({
          data: { workspaceId: ana.personalId, name: 'Invasão', type: 'cash', createdBy: bruno.id },
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('o log de auditoria não pode ser alterado nem apagado pela aplicação', async () => {
    const ana = await registerUser(app, 'Ana');
    await expect(withUser(appRole, ana.id, (tx) => tx.auditLog.deleteMany({}))).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(appRole, ana.id, (tx) => tx.auditLog.updateMany({ data: { action: 'x' } })),
    ).rejects.toThrow(/permission denied/i);
  });

  it('o banco impede compra no cartão debitando direto de uma conta', async () => {
    const ana = await registerUser(app, 'Ana');
    const acc = await createAccount(ana, ana.personalId, 'Conta').expect(201);
    await expect(
      withUser(appRole, ana.id, async (tx) => {
        const card = await tx.creditCard.create({
          data: { workspaceId: ana.personalId, name: 'Visa', brand: 'visa', limitCents: 500000n, closingDay: 20, dueDay: 1, paymentAccountId: acc.body.id },
        });
        await tx.transaction.create({
          data: {
            workspaceId: ana.personalId,
            kind: 'expense',
            amountCents: 1000n,
            description: 'Errado',
            competenceDate: new Date('2026-11-25T00:00:00Z'),
            status: 'pending',
            creditCardId: card.id,
            accountId: acc.body.id,
            createdBy: ana.id,
          },
        });
      }),
    ).rejects.toThrow(/transactions_target_shape/);
  });
});
