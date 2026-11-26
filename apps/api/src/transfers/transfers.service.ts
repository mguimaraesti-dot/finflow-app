import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { fromIsoDate, toCents, toIsoDate, type Tx } from '@finflow/db';
import { todayIn, type CreateTransferInput, type UpdateTransferInput } from '@finflow/shared';
import { AuditService } from '../common/audit.service';
import { withIdempotency } from '../common/idempotency';
import { PrismaService } from '../common/prisma.service';
import { requireWorkspace, requireWriter } from '../workspaces/workspaces.service';

/**
 * Transferência = um grupo com duas pernas: saída (transfer_out) na origem e entrada
 * (transfer_in) no destino, sempre com mesmo valor, data e situação.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  create(userId: string, workspaceId: string, input: CreateTransferInput, idempotencyKey?: string) {
    return this.prisma.asUser(userId, (tx) =>
      withIdempotency(tx, userId, idempotencyKey, { workspaceId, input }, async () => {
        await requireWriter(tx, workspaceId);
        await this.checkAccounts(tx, workspaceId, input.fromAccountId, input.toAccountId);
        const group = await tx.transferGroup.create({
          data: { workspaceId, amountCents: BigInt(input.amount), date: fromIsoDate(input.date), createdBy: userId },
          select: { id: true },
        });
        const paidAt = input.paid ? fromIsoDate(await this.paidDate(tx, workspaceId, input.date)) : null;
        const leg = (kind: 'transfer_out' | 'transfer_in', accountId: string) => ({
          workspaceId,
          kind,
          amountCents: BigInt(input.amount),
          description: input.description,
          competenceDate: fromIsoDate(input.date),
          dueDate: fromIsoDate(input.date),
          status: input.paid ? ('paid' as const) : ('pending' as const),
          paidAt,
          notes: input.notes ?? null,
          accountId,
          transferGroupId: group.id,
          createdBy: userId,
        });
        await tx.transaction.createMany({
          data: [leg('transfer_out', input.fromAccountId), leg('transfer_in', input.toAccountId)],
        });
        await this.audit.log(tx, { actorId: userId, workspaceId, entity: 'transfer', entityId: group.id, action: 'create', after: input });
        return { id: group.id };
      }),
    );
  }

  get(userId: string, workspaceId: string, id: string) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWorkspace(tx, workspaceId);
      return this.present(await this.find(tx, workspaceId, id));
    });
  }

  update(userId: string, workspaceId: string, id: string, input: UpdateTransferInput) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWriter(tx, workspaceId);
      const before = this.present(await this.find(tx, workspaceId, id));
      const from = input.fromAccountId ?? before.from.id;
      const to = input.toAccountId ?? before.to.id;
      if (from === to) throw new BadRequestException({ error: 'same_account', message: 'Escolha contas diferentes' });
      await this.checkAccounts(tx, workspaceId, from, to);

      const date = input.date ?? before.date;
      const paid = input.paid ?? before.paid;
      // Mantém a data do pagamento se continuou pago; recalcula se acabou de ser marcado.
      const paidAt = !paid ? null : before.paid && before.paidAt ? before.paidAt : await this.paidDate(tx, workspaceId, date);
      const common = {
        ...(input.amount !== undefined && { amountCents: BigInt(input.amount) }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.notes !== undefined && { notes: input.notes }),
        competenceDate: fromIsoDate(date),
        dueDate: fromIsoDate(date),
        status: paid ? ('paid' as const) : ('pending' as const),
        paidAt: paidAt ? fromIsoDate(paidAt) : null,
      };
      await tx.transferGroup.update({
        where: { id },
        data: { date: fromIsoDate(date), ...(input.amount !== undefined && { amountCents: BigInt(input.amount) }) },
      });
      await tx.transaction.updateMany({ where: { transferGroupId: id, kind: 'transfer_out', deletedAt: null }, data: { ...common, accountId: from } });
      await tx.transaction.updateMany({ where: { transferGroupId: id, kind: 'transfer_in', deletedAt: null }, data: { ...common, accountId: to } });
      await this.audit.log(tx, { actorId: userId, workspaceId, entity: 'transfer', entityId: id, action: 'update', before, after: input });
      return { id };
    });
  }

  remove(userId: string, workspaceId: string, id: string) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWriter(tx, workspaceId);
      const legs = await this.find(tx, workspaceId, id);
      const ids = legs.map((l) => l.id);
      await tx.transaction.updateMany({ where: { id: { in: ids }, workspaceId }, data: { deletedAt: new Date() } });
      await this.audit.log(tx, { actorId: userId, workspaceId, entity: 'transfer', entityId: id, action: 'delete', after: { ids } });
      return { deleted: ids.length, ids };
    });
  }

  // ---------- apoio ----------

  private async find(tx: Tx, workspaceId: string, id: string) {
    const legs = await tx.transaction.findMany({
      where: { workspaceId, transferGroupId: id, deletedAt: null },
      include: { account: { select: { id: true, name: true } } },
    });
    if (legs.length !== 2) throw new NotFoundException({ error: 'transfer_not_found' });
    return legs;
  }

  private present(legs: Awaited<ReturnType<TransfersService['find']>>) {
    const out = legs.find((l) => l.kind === 'transfer_out')!;
    const inn = legs.find((l) => l.kind === 'transfer_in')!;
    return {
      id: out.transferGroupId!,
      amount: toCents(out.amountCents),
      date: toIsoDate(out.competenceDate),
      description: out.description,
      notes: out.notes,
      paid: out.status === 'paid',
      paidAt: out.paidAt ? toIsoDate(out.paidAt) : null,
      from: out.account!,
      to: inn.account!,
      createdBy: out.createdBy,
    };
  }

  private async checkAccounts(tx: Tx, workspaceId: string, from: string, to: string) {
    const found = await tx.account.count({ where: { id: { in: [from, to] }, workspaceId, archivedAt: null } });
    if (found !== 2) throw new BadRequestException({ error: 'invalid_account', message: 'Conta não encontrada neste espaço' });
  }

  /** Transferência marcada como feita: data dela, ou hoje se for futura. */
  private async paidDate(tx: Tx, workspaceId: string, date: string) {
    const ws = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { timezone: true } });
    const today = todayIn(ws.timezone);
    return date <= today ? date : today;
  }
}
