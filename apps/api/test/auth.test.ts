import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MailerService } from '../src/common/mailer.service';
import { api, appRole, owner, registerUser, resetDatabase, startApp, tokenFromUrl } from './helpers';

let app: INestApplication;
let mailer: MailerService;

beforeAll(async () => {
  ({ app, mailer } = await startApp());
});
beforeEach(resetDatabase);
afterAll(async () => {
  await app.close();
  await owner.$disconnect();
  await appRole.$disconnect();
});

describe('cadastro', () => {
  it('cria a pessoa já com espaço Pessoal, categorias padrão e consentimento', async () => {
    const user = await registerUser(app, 'Marcelo');
    const ws = await api(app, user).get('/workspaces').expect(200);
    expect(ws.body).toHaveLength(1);
    expect(ws.body[0]).toMatchObject({ name: 'Pessoal', type: 'personal', role: 'owner' });

    const categories = await owner.category.count({ where: { workspaceId: user.personalId } });
    expect(categories).toBeGreaterThanOrEqual(10);
    expect(await owner.consent.count({ where: { userId: user.id } })).toBe(1);

    const stored = await owner.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.passwordHash!.startsWith('$argon2id$')).toBe(true);
  });

  it('recusa e-mail repetido, sem diferenciar maiúsculas', async () => {
    const user = await registerUser(app, 'Ana');
    await api(app)
      .post('/auth/register', { name: 'Outra', email: user.email.toUpperCase(), password: 'senha-forte-123' })
      .expect(409);
  });

  it('valida os dados no servidor', async () => {
    const res = await api(app).post('/auth/register', { name: '', email: 'x', password: '123' }).expect(400);
    expect(res.body.fields.map((f: { path: string }) => f.path).sort()).toEqual(['email', 'name', 'password']);
  });
});

describe('login e sessões', () => {
  it('aceita a senha certa e recusa a errada com a mesma mensagem de e-mail inexistente', async () => {
    const user = await registerUser(app, 'Bia');
    await api(app).post('/auth/login', { email: user.email, password: 'senha-forte-123' }).expect(200);
    const wrong = await api(app).post('/auth/login', { email: user.email, password: 'errada-errada' }).expect(401);
    const missing = await api(app).post('/auth/login', { email: 'ninguem@exemplo.com', password: 'qualquer-coisa' }).expect(401);
    expect(wrong.body).toEqual(missing.body);
    expect(await owner.auditLog.count({ where: { action: 'login_failed' } })).toBe(2);
  });

  it('exige token nas rotas protegidas', async () => {
    await api(app).get('/workspaces').expect(401);
    await api(app).get('/workspaces').set('Authorization', 'Bearer lixo').expect(401);
  });

  it('gira o refresh token e encerra tudo se um token antigo for reutilizado', async () => {
    const user = await registerUser(app, 'Caio');
    const first = await api(app).post('/auth/refresh', { refreshToken: user.refreshToken }).expect(200);
    expect(first.body.refreshToken).not.toBe(user.refreshToken);

    // Reuso do token antigo: recusado e a sessão nova também é derrubada.
    await api(app).post('/auth/refresh', { refreshToken: user.refreshToken }).expect(401);
    await api(app).post('/auth/refresh', { refreshToken: first.body.refreshToken }).expect(401);
    expect(await owner.auditLog.count({ where: { action: 'refresh_reuse_detected' } })).toBe(1);
  });

  it('logout revoga a sessão atual', async () => {
    const user = await registerUser(app, 'Davi');
    await api(app, user).post('/auth/logout').expect(204);
    await api(app).post('/auth/refresh', { refreshToken: user.refreshToken }).expect(401);
  });
});

describe('recuperação de senha', () => {
  it('troca a senha com o link e derruba as sessões antigas', async () => {
    const user = await registerUser(app, 'Eva');
    const res = await api(app).post('/auth/forgot-password', { email: user.email }).expect(202);
    expect(res.body.message).toMatch(/Se houver uma conta/);

    const mail = mailer.outbox.at(-1)!;
    expect(mail.to).toBe(user.email);
    const link = /https?:\/\/\S+/.exec(mail.text)![0];
    const token = tokenFromUrl(link);

    await api(app).post('/auth/reset-password', { token, password: 'nova-senha-456' }).expect(204);
    await api(app).post('/auth/reset-password', { token, password: 'outra-senha-789' }).expect(401);
    await api(app).post('/auth/login', { email: user.email, password: 'senha-forte-123' }).expect(401);
    await api(app).post('/auth/login', { email: user.email, password: 'nova-senha-456' }).expect(200);
    await api(app).post('/auth/refresh', { refreshToken: user.refreshToken }).expect(401);
  });

  it('responde igual para e-mail que não existe', async () => {
    const before = mailer.outbox.length;
    const res = await api(app).post('/auth/forgot-password', { email: 'nao-existe@exemplo.com' }).expect(202);
    expect(res.body.message).toMatch(/Se houver uma conta/);
    expect(mailer.outbox.length).toBe(before);
  });
});
