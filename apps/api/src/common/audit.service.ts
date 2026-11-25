import { Injectable } from '@nestjs/common';
import type { Prisma, Tx } from '@finflow/db';

export interface AuditEntry {
  actorId: string | null;
  workspaceId?: string | null;
  entity: string;
  entityId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

const SECRET_KEYS = /password|token|secret|hash/i;

function redact(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (SECRET_KEYS.test(key)) return '[redacted]';
      return typeof v === 'bigint' ? v.toString() : v;
    }),
  ) as Prisma.InputJsonValue;
}

/**
 * Log de auditoria: só inserção (o papel da aplicação não tem UPDATE/DELETE nesta tabela).
 * Usa createMany porque ele não lê a linha de volta: um evento anônimo (login falho) ou de
 * quem acabou de sair de um espaço não seria visível para quem gravou.
 */
@Injectable()
export class AuditService {
  async log(tx: Tx, entry: AuditEntry): Promise<void> {
    await tx.auditLog.createMany({
      data: {
        actorId: entry.actorId,
        workspaceId: entry.workspaceId ?? null,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        action: entry.action,
        before: redact(entry.before),
        after: redact(entry.after),
        ip: entry.ip ?? null,
      },
    });
  }
}
