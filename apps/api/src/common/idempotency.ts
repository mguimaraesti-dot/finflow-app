import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma, Tx } from '@finflow/db';

const TTL_MS = 24 * 3600_000;

/**
 * Protege contra lançamento em dobro (duplo toque, reenvio por rede ruim).
 * O cliente manda o mesmo Idempotency-Key ao repetir a mesma operação; a segunda vez
 * devolve a resposta da primeira, sem gravar de novo. Roda na mesma transação da operação.
 */
export async function withIdempotency<T>(
  tx: Tx,
  userId: string,
  key: string | undefined,
  body: unknown,
  run: () => Promise<T>,
): Promise<T> {
  if (!key) return run();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw new ConflictException({ error: 'invalid_idempotency_key' });
  const requestHash = createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');

  // Serializa pedidos simultâneos com a mesma chave.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId + ':' + key}, 0))`;
  const existing = await tx.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } });
  if (existing && existing.expiresAt > new Date()) {
    if (existing.requestHash !== requestHash) {
      throw new ConflictException({ error: 'idempotency_key_reused', message: 'Esta operação já foi enviada com outros dados' });
    }
    return existing.response as T;
  }

  const result = await run();
  await tx.idempotencyKey.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, requestHash, statusCode: 201, response: result as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + TTL_MS) },
    update: { requestHash, statusCode: 201, response: result as Prisma.InputJsonValue, createdAt: new Date(), expiresAt: new Date(Date.now() + TTL_MS) },
  });
  return result;
}
