import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from './config';
import { createApp } from './main';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let handler: Promise<Handler> | undefined;

async function build(): Promise<Handler> {
  const app = await createApp(loadConfig());
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

/** Entrada para funções serverless (Vercel): reaproveita a aplicação entre invocações. */
export default async function serverless(req: IncomingMessage, res: ServerResponse) {
  handler ??= build().catch((e) => {
    handler = undefined;
    throw e;
  });
  (await handler)(req, res);
}
