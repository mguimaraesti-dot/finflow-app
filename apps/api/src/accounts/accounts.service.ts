import { Injectable } from '@nestjs/common';
import { fromIsoDate, toCents, toIsoDate } from '@finflow/db';
import type { CreateAccountInput } from '@finflow/shared';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { requireWorkspace, requireWriter } from '../workspaces/workspaces.service';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(userId: string, workspaceId: string) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWorkspace(tx, workspaceId);
      const accounts = await tx.account.findMany({
        where: { workspaceId, archivedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      const balances = await tx.$queryRaw<
        { account_id: string; current_balance_cents: bigint; projected_balance_cents: bigint }[]
      >`SELECT account_id, current_balance_cents, projected_balance_cents FROM account_balances WHERE workspace_id = ${workspaceId}::uuid`;
      const byId = new Map(balances.map((b) => [b.account_id, b]));
      return accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        color: a.color,
        includeInTotal: a.includeInTotal,
        openingDate: toIsoDate(a.openingDate),
        initialBalance: toCents(a.initialBalanceCents),
        currentBalance: toCents(byId.get(a.id)?.current_balance_cents ?? a.initialBalanceCents),
        projectedBalance: toCents(byId.get(a.id)?.projected_balance_cents ?? a.initialBalanceCents),
      }));
    });
  }

  create(userId: string, workspaceId: string, input: CreateAccountInput) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWriter(tx, workspaceId);
      const account = await tx.account.create({
        data: {
          workspaceId,
          name: input.name,
          type: input.type,
          initialBalanceCents: BigInt(input.initialBalance),
          ...(input.openingDate ? { openingDate: fromIsoDate(input.openingDate) } : {}),
          color: input.color ?? null,
          includeInTotal: input.includeInTotal,
          createdBy: userId,
        },
      });
      await this.audit.log(tx, { actorId: userId, workspaceId, entity: 'account', entityId: account.id, action: 'create', after: account });
      return { id: account.id, name: account.name, type: account.type };
    });
  }
}
