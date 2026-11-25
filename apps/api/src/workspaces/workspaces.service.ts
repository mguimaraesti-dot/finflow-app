import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Tx } from '@finflow/db';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { extractPgCode } from '../common/http-errors';
import { seedDefaultCategories } from './default-categories';

/** Garante que o espaço existe para quem pergunta; o RLS já esconde os demais (vira 404). */
export async function requireWorkspace(tx: Tx, workspaceId: string) {
  const ws = await tx.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) throw new NotFoundException({ error: 'workspace_not_found' });
  return ws;
}

export async function requireOwner(tx: Tx, workspaceId: string) {
  const ws = await requireWorkspace(tx, workspaceId);
  const [row] = await tx.$queryRaw<{ role: string | null }[]>`SELECT app.member_role(${workspaceId}::uuid)::text AS role`;
  if (row?.role !== 'owner') throw new ForbiddenException({ error: 'owner_only', message: 'Só quem criou o espaço pode fazer isso' });
  return ws;
}

export async function requireWriter(tx: Tx, workspaceId: string) {
  await requireWorkspace(tx, workspaceId);
  const [row] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT app.can_write(${workspaceId}::uuid) AS ok`;
  if (!row?.ok) throw new ForbiddenException({ error: 'read_only', message: 'Você só tem acesso de leitura neste espaço' });
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(userId: string) {
    return this.prisma.asUser(userId, async (tx) => {
      const rows = await tx.workspace.findMany({
        orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
        include: {
          memberships: { select: { userId: true, role: true, user: { select: { name: true } } } },
        },
      });
      return rows.map((w) => ({
        id: w.id,
        name: w.name,
        type: w.type,
        currency: w.currency,
        role: w.memberships.find((m) => m.userId === userId)?.role ?? null,
        members: w.memberships.map((m) => ({ userId: m.userId, name: m.user.name, role: m.role })),
      }));
    });
  }

  createShared(userId: string, name: string) {
    return this.prisma.asUser(userId, async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT app.create_workspace(${name}, 'shared') AS id`;
      const id = row!.id;
      await seedDefaultCategories(tx, id);
      await this.audit.log(tx, { actorId: userId, workspaceId: id, entity: 'workspace', entityId: id, action: 'create', after: { name, type: 'shared' } });
      return { id, name, type: 'shared' as const, role: 'owner' as const };
    });
  }

  rename(userId: string, workspaceId: string, name: string) {
    return this.prisma.asUser(userId, async (tx) => {
      const before = await requireWorkspace(tx, workspaceId);
      const updated = await tx.workspace.updateMany({ where: { id: workspaceId }, data: { name } });
      if (updated.count === 0) throw new ForbiddenException({ error: 'owner_only' });
      await this.audit.log(tx, { actorId: userId, workspaceId, entity: 'workspace', entityId: workspaceId, action: 'rename', before: { name: before.name }, after: { name } });
      return { id: workspaceId, name };
    });
  }

  removeMember(userId: string, workspaceId: string, memberUserId: string) {
    return this.prisma.asUser(userId, async (tx) => {
      const ws = await requireWorkspace(tx, workspaceId);
      if (ws.type === 'personal') throw new BadRequestException({ error: 'personal_workspace' });
      // Registra antes de remover: depois de sair, quem saiu já não grava neste espaço.
      await this.audit.log(tx, {
        actorId: userId,
        workspaceId,
        entity: 'membership',
        entityId: memberUserId,
        action: memberUserId === userId ? 'leave' : 'remove',
      });
      try {
        const removed = await tx.membership.deleteMany({ where: { workspaceId, userId: memberUserId } });
        if (removed.count === 0) throw new ForbiddenException({ error: 'cannot_remove_member' });
      } catch (e) {
        if (extractPgCode(e) === '42501') throw new ForbiddenException({ error: 'cannot_remove_member' });
        throw e;
      }
    });
  }

  assertNotDuplicateName(name: string) {
    if (name.toLowerCase() === 'pessoal') {
      throw new ConflictException({ error: 'reserved_name', message: '"Pessoal" é o nome do seu espaço individual' });
    }
  }
}
