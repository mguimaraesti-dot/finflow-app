import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@finflow/db';
import request from 'supertest';
import type { AppConfig } from '../src/config';
import { MailerService } from '../src/common/mailer.service';
import { createApp } from '../src/main';

const TEST_DB_APP =
  process.env.TEST_DATABASE_URL_APP ?? 'postgresql://finflow_api:finflow_api@localhost:5432/finflow_test';
const TEST_DB_OWNER =
  process.env.TEST_DATABASE_URL ?? 'postgresql://finflow_owner:finflow_owner@localhost:5432/finflow_test';

export const testConfig: AppConfig = {
  NODE_ENV: 'test',
  DATABASE_URL_APP: TEST_DB_APP,
  JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123456',
  API_PORT: 0,
  API_CORS_ORIGIN: 'http://localhost:3000',
  WEB_URL: 'http://localhost:3000',
};

/** Conexão de dono do schema: só para limpar o banco e inspecionar, nunca no app. */
export const owner = new PrismaClient({ datasources: { db: { url: TEST_DB_OWNER } } });
/** Conexão com o papel da aplicação, para testar o RLS direto no banco. */
export const appRole = new PrismaClient({ datasources: { db: { url: TEST_DB_APP } } });

export async function resetDatabase() {
  const tables = await owner.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  if (list) await owner.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export async function startApp(): Promise<{ app: INestApplication; mailer: MailerService }> {
  const app = await createApp(testConfig);
  await app.init();
  return { app, mailer: app.get(MailerService) };
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  refreshToken: string;
  personalId: string;
}

let counter = 0;

export async function registerUser(app: INestApplication, name = 'Pessoa'): Promise<TestUser> {
  counter += 1;
  const email = `${name.toLowerCase()}${counter}@exemplo.com`;
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name, email, password: 'senha-forte-123' })
    .expect(201);
  const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
  const ws = await request(app.getHttpServer()).get('/workspaces').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
  const personal = (ws.body as { id: string; type: string }[]).find((w) => w.type === 'personal');
  return { id: me.body.id, email, token: res.body.accessToken, refreshToken: res.body.refreshToken, personalId: personal!.id };
}

export function api(app: INestApplication, user?: TestUser) {
  const server = app.getHttpServer();
  const auth = (r: request.Test) => (user ? r.set('Authorization', `Bearer ${user.token}`) : r);
  return {
    get: (url: string) => auth(request(server).get(url)),
    post: (url: string, body?: object) => auth(request(server).post(url)).send(body ?? {}),
    patch: (url: string, body?: object) => auth(request(server).patch(url)).send(body ?? {}),
    delete: (url: string) => auth(request(server).delete(url)),
  };
}

export function tokenFromUrl(url: string): string {
  return new URL(url).searchParams.get('token')!;
}
