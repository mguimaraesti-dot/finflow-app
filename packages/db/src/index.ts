import { Prisma, PrismaClient } from '@prisma/client';

export * from '@prisma/client';

export type Tx = Prisma.TransactionClient;

/**
 * Cliente da aplicação: conecta com o papel sem BYPASSRLS (DATABASE_URL_APP).
 * Todo acesso a dados de espaço passa por `withUser`, que define o usuário da
 * transação para as políticas de Row-Level Security.
 */
export function createAppClient(url = process.env.DATABASE_URL_APP): PrismaClient {
  if (!url) throw new Error('DATABASE_URL_APP não definida');
  return new PrismaClient({ datasources: { db: { url } } });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withUser<T>(
  prisma: PrismaClient,
  userId: string,
  fn: (tx: Tx) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number },
): Promise<T> {
  if (!UUID.test(userId)) throw new Error('userId inválido');
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  }, options);
}

/** BigInt do banco → número seguro (centavos). Lança se passar do limite. */
export function toCents(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError('Valor excede o limite seguro');
  return n;
}

/** Date de coluna DATE → "yyyy-mm-dd" (Prisma entrega meia-noite UTC). */
export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** "yyyy-mm-dd" → Date para coluna DATE. */
export function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
