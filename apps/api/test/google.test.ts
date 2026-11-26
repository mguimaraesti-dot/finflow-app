import type { INestApplication } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseIdentityVerifier, type ExternalIdentity } from '../src/auth/supabase-identity';
import { api, appRole, owner, registerUser, resetDatabase, startApp } from './helpers';

let app: INestApplication;
let identities: Record<string, ExternalIdentity>;

beforeAll(async () => {
  ({ app } = await startApp());
  // O Supabase não é chamado nos testes: cada "token" corresponde a uma identidade fictícia.
  vi.spyOn(app.get(SupabaseIdentityVerifier), 'verify').mockImplementation(async (token: string) => {
    const id = identities[token];
    if (!id) throw new UnauthorizedException({ error: 'invalid_identity' });
    return id;
  });
});
beforeEach(async () => {
  await resetDatabase();
  identities = {};
});
afterAll(async () => {
  await app.close();
  await owner.$disconnect();
  await appRole.$disconnect();
});

const google = (token: string) => request(app.getHttpServer()).post('/auth/google').send({ accessToken: token });
const ident = (subject: string, email: string, emailVerified = true): ExternalIdentity => ({
  provider: 'google',
  subject,
  email,
  emailVerified,
  name: 'Carla Souza',
});

describe('login com Google', () => {
  it('primeira vez cria conta com espaço Pessoal; depois entra na mesma conta', async () => {
    identities['tok-carla-1-xxxxxxxxxxxxxx'] = ident('g-carla', 'carla@gmail.com');
    const first = await google('tok-carla-1-xxxxxxxxxxxxxx').expect(200);
    const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${first.body.accessToken}`).expect(200);
    expect(me.body).toMatchObject({ email: 'carla@gmail.com', name: 'Carla Souza' });
    expect(me.body.emailVerifiedAt).not.toBeNull();

    const ws = await request(app.getHttpServer()).get('/workspaces').set('Authorization', `Bearer ${first.body.accessToken}`).expect(200);
    expect(ws.body).toHaveLength(1);
    expect(ws.body[0].type).toBe('personal');

    identities['tok-carla-2-xxxxxxxxxxxxxx'] = ident('g-carla', 'carla@gmail.com');
    const second = await google('tok-carla-2-xxxxxxxxxxxxxx').expect(200);
    const me2 = await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${second.body.accessToken}`).expect(200);
    expect(me2.body.id).toBe(me.body.id);
    expect(await owner.user.count()).toBe(1);
  });

  it('vincula à conta existente com o mesmo e-mail e mantém os dados dela', async () => {
    const ana = await registerUser(app, 'Ana');
    await api(app, ana).post(`/workspaces/${ana.personalId}/accounts`, { name: 'Itaú', type: 'checking' }).expect(201);
    identities['tok-ana-xxxxxxxxxxxxxxxxxx'] = ident('g-ana', ana.email);

    const res = await google('tok-ana-xxxxxxxxxxxxxxxxxx').expect(200);
    const accounts = await request(app.getHttpServer())
      .get(`/workspaces/${ana.personalId}/accounts`)
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    expect(accounts.body[0].name).toBe('Itaú');
    // A senha continua valendo.
    await request(app.getHttpServer()).post('/auth/login').send({ email: ana.email, password: 'senha-forte-123' }).expect(200);
  });

  it('não vincula por e-mail que o Google não confirmou', async () => {
    const ana = await registerUser(app, 'Ana');
    identities['tok-fake-xxxxxxxxxxxxxxxxx'] = ident('g-fake', ana.email, false);
    const res = await google('tok-fake-xxxxxxxxxxxxxxxxx').expect(401);
    expect(res.body.error).toBe('email_not_verified');
    expect(await owner.userIdentity.count()).toBe(0);
  });

  it('token inválido não entra; conta só do Google não entra por senha', async () => {
    await google('tok-invalido-xxxxxxxxxxxxx').expect(401);
    identities['tok-bia-xxxxxxxxxxxxxxxxxx'] = ident('g-bia', 'bia@gmail.com');
    await google('tok-bia-xxxxxxxxxxxxxxxxxx').expect(200);
    await request(app.getHttpServer()).post('/auth/login').send({ email: 'bia@gmail.com', password: 'qualquer-senha-123' }).expect(401);
  });
});
