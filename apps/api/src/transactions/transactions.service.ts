import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { fromIsoDate, Prisma, toCents, toIsoDate, type Tx } from '@finflow/db';
import {
  addMonths,
  monthRange,
  planOccurrences,
  RECURRING_WINDOW,
  todayIn,
  type CreateTransactionInput,
  type DeleteScope,
  type UpdateTransactionInput,
} from '@finflow/shared';
import { AuditService } from '../common/audit.service';
import { withIdempotency } from '../common/idempotency';
import { PrismaService } from '../common/prisma.service';
import { requireWorkspace, requireWriter } from '../workspaces/workspaces.service';

const ACCOUNT_KINDS = ['income', 'expense'] as const;

const listInclude = {
  account: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, icon: true } },
  series: { select: { type: true, totalInstallments: true } },
  creditCard: { select: { id: true, name: true } },
  invoice: { select: { referenceMonth: true, creditCardId: true } },
} satisfies Prisma.TransactionInclude;

type Row = Prisma.TransactionGetPayload<{ include: typeof listInclude }>;

function present(t: Row, names: Map<string, string>, transferTo = new Map<string, { id: string; name: string }>()) {
  return {
    id: t.id,
    kind: t.kind,
    amount: toCents(t.amountCents),
    description: t.description,
    date: toIsoDate(t.competenceDate),
    status: t.status,
    paidAt: t.paidAt ? toIsoDate(t.paidAt) : null,
    ignored: t.ignored,
    notes: t.notes,
    account: t.account ? { id: t.account.id, name: t.account.name } : null,
    card: t.creditCard ? { id: t.creditCard.id, name: t.creditCard.name } : null,
    // Compra no cartão ou pagamento de fatura: qual fatura (mês do vencimento).
    invoice: t.invoice ? { cardId: t.invoice.creditCardId, month: toIsoDate(t.invoice.referenceMonth).slice(0, 7) } : null,
    category: t.category,
    // Transferência aparece uma vez na lista, pela perna de saída.
    transfer: t.transferGroupId ? { id: t.transferGroupId, to: transferTo.get(t.transferGroupId) ?? null } : null,
    createdBy: { id: t.createdBy, name: names.get(t.createdBy) ?? '' },
    series: t.seriesId
      ? {
          id: t.seriesId,
          type: t.series!.type,
          number: t.installmentNumber,
          total: t.series!.totalInstallments,
        }
      : null,
  };
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listCategories(userId: string, workspaceId: string) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWorkspace(tx, workspaceId);
      return tx.category.findMany({
        where: { workspaceId, archivedAt: null },
        select: { id: true, name: true, kind: true, icon: true, color: true, parentId: true },
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      });
    });
  }

  list(userId: string, workspaceId: string, month: string) {
    const { from, to } = monthRange(month);
    return this.prisma.asUser(userId, async (tx) => {
      await requireWorkspace(tx, workspaceId);
      await this.extendOpenRecurrences(tx, workspaceId, to);
      const rows = await tx.transaction.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          kind: { in: [...ACCOUNT_KINDS, 'invoice_payment', 'transfer_out'] },
          competenceDate: { gte: fromIsoDate(from), lte: fromIsoDate(to) },
        },
        include: listInclude,
        orderBy: [{ competenceDate: 'desc' }, { createdAt: 'desc' }],
      });
      const names = await this.memberNames(tx, workspaceId);
      const groups = rows.flatMap((r) => (r.transferGroupId ? [r.transferGroupId] : []));
      const ins = groups.length
        ? await tx.transaction.findMany({
            where: { workspaceId, transferGroupId: { in: groups }, kind: 'transfer_in', deletedAt: null },
            select: { transferGroupId: true, account: { select: { id: true, name: true } } },
          })
        : [];
      const transferTo = new Map(ins.map((i) => [i.transferGroupId!, i.account!]));
      const items = rows.map((r) => present(r, names, transferTo));

      // Receitas e despesas por competência, incluindo compras no cartão. O pagamento da
      // fatura só move a conta: contá-lo de novo como despesa duplicaria o gasto.
      const counted = items.filter((i) => !i.ignored);
      const sum = (pred: (i: (typeof items)[number]) => boolean) => counted.filter(pred).reduce((s, i) => s + i.amount, 0);
      const income = sum((i) => i.kind === 'income');
      const expense = sum((i) => i.kind === 'expense');
      const inAccount = (i: (typeof items)[number]) => i.card === null && (i.kind === 'income' || i.kind === 'expense');
      return {
        month,
        summary: {
          income,
          expense,
          result: income - expense,
          incomePaid: sum((i) => inAccount(i) && i.kind === 'income' && i.status === 'paid'),
          expensePaid: sum((i) => inAccount(i) && i.kind === 'expense' && i.status === 'paid'),
          pendingCount: counted.filter((i) => inAccount(i) && i.status === 'pending').length,
        },
        items,
      };
    });
  }

  get(userId: string, workspaceId: string, id: string) {
    return this.prisma.asUser(userId, async (tx) => {
      const row = await this.find(tx, workspaceId, id);
      return present(row, await this.memberNames(tx, workspaceId));
    });
  }

  create(userId: string, workspaceId: string, input: CreateTransactionInput, idempotencyKey?: string) {
    return this.prisma.asUser(userId, (tx) =>
      withIdempotency(tx, userId, idempotencyKey, { workspaceId, input }, async () => {
        await requireWriter(tx, workspaceId);
        await this.checkRefs(tx, workspaceId, input.kind, input.accountId, input.categoryId ?? null);
        const today = await this.today(tx, workspaceId);
        const occurrences = planOccurrences(input.date, input.amount, input.repeat);

        let seriesId: string | null = null;
        if (input.repeat.type !== 'none') {
          const series = await tx.transactionSeries.create({
            data: {
              workspaceId,
              type: input.repeat.type === 'installment' ? 'installment' : 'recurring',
              frequency: 'monthly',
              startDate: fromIsoDate(input.date),
              endDate: input.repeat.type === 'monthly' && input.repeat.count ? fromIsoDate(occurrences.at(-1)!.date) : null,
              totalInstallments: input.repeat.type === 'installment' ? input.repeat.count : null,
              template: {
                kind: input.kind,
                amount: input.amount,
                description: input.description,
                accountId: input.accountId,
                categoryId: input.categoryId ?? null,
                notes: input.notes ?? null,
                ignored: input.ignored,
              },
              createdBy: userId,
            },
          });
          seriesId = series.id;
        }

        // Só a primeira ocorrência pode nascer paga; as futuras ficam previstas.
        const created = [];
        for (const [i, occ] of occurrences.entries()) {
          const paid = i === 0 && input.paid;
          created.push(
            await tx.transaction.create({
              data: {
                workspaceId,
                kind: input.kind,
                amountCents: BigInt(occ.amount),
                description: input.description,
                competenceDate: fromIsoDate(occ.date),
                dueDate: fromIsoDate(occ.date),
                status: paid ? 'paid' : 'pending',
                paidAt: paid ? fromIsoDate(occ.date <= today ? occ.date : today) : null,
                ignored: input.ignored,
                notes: input.notes ?? null,
                accountId: input.accountId,
                categoryId: input.categoryId ?? null,
                seriesId,
                installmentNumber: occ.installmentNumber,
                source: seriesId && i > 0 ? 'recurring' : 'manual',
                createdBy: userId,
              },
              select: { id: true },
            }),
          );
        }
        await this.audit.log(tx, {
          actorId: userId,
          workspaceId,
          entity: 'transaction',
          entityId: created[0]!.id,
          action: 'create',
          after: { ...input, occurrences: occurrences.length, seriesId },
        });
        return { id: created[0]!.id, seriesId, count: created.length };
      }),
    );
  }

  update(userId: string, workspaceId: string, id: string, input: UpdateTransactionInput) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWriter(tx, workspaceId);
      const before = await this.find(tx, workspaceId, id);
      await this.checkRefs(
        tx,
        workspaceId,
        before.kind,
        input.accountId ?? before.accountId!,
        input.categoryId === undefined ? before.categoryId : input.categoryId,
      );
      const data: Prisma.TransactionUncheckedUpdateInput = {};
      if (input.amount !== undefined) data.amountCents = BigInt(input.amount);
      if (input.description !== undefined) data.description = input.description;
      if (input.date !== undefined) {
        data.competenceDate = fromIsoDate(input.date);
        data.dueDate = fromIsoDate(input.date);
      }
      if (input.accountId !== undefined) data.accountId = input.accountId;
      if (input.categoryId !== undefined) data.categoryId = input.categoryId;
      if (input.ignored !== undefined) data.ignored = input.ignored;
      if (input.notes !== undefined) data.notes = input.notes;
      await tx.transaction.update({ where: { id }, data });
      await this.audit.log(tx, {
        actorId: userId,
        workspaceId,
        entity: 'transaction',
        entityId: id,
        action: 'update',
        before: { ...before, account: undefined, category: undefined, series: undefined },
        after: input,
      });
      return { id };
    });
  }

  setPaid(userId: string, workspaceId: string, id: string, paid: boolean, paidAt?: string) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWriter(tx, workspaceId);
      const before = await this.find(tx, workspaceId, id);
      const date = paidAt ?? (await this.today(tx, workspaceId));
      await tx.transaction.update({
        where: { id },
        data: paid ? { status: 'paid', paidAt: fromIsoDate(date) } : { status: 'pending', paidAt: null },
      });
      await this.audit.log(tx, {
        actorId: userId,
        workspaceId,
        entity: 'transaction',
        entityId: id,
        action: paid ? 'pay' : 'unpay',
        before: { status: before.status, paidAt: before.paidAt },
        after: paid ? { status: 'paid', paidAt: date } : { status: 'pending' },
      });
      return { id, status: paid ? 'paid' : 'pending' };
    });
  }

  /** Exclusão lógica. Em séries, "future" apaga esta e as seguintes e encerra a recorrência. */
  remove(userId: string, workspaceId: string, id: string, scope: DeleteScope) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWriter(tx, workspaceId);
      const row = await this.find(tx, workspaceId, id);
      const now = new Date();
      let ids = [id];
      if (scope === 'future' && row.seriesId) {
        const later = await tx.transaction.findMany({
          where: { workspaceId, seriesId: row.seriesId, deletedAt: null, competenceDate: { gte: row.competenceDate } },
          select: { id: true },
        });
        ids = later.map((l) => l.id);
        // A série passa a terminar na ocorrência anterior: nada novo é gerado depois disso.
        await tx.transactionSeries.update({
          where: { id: row.seriesId },
          data: { endDate: fromIsoDate(addMonths(toIsoDate(row.competenceDate), -1)) },
        });
      }
      await tx.transaction.updateMany({ where: { id: { in: ids }, workspaceId }, data: { deletedAt: now } });
      await this.audit.log(tx, {
        actorId: userId,
        workspaceId,
        entity: 'transaction',
        entityId: id,
        action: 'delete',
        after: { scope, ids },
      });
      return { deleted: ids.length, ids };
    });
  }

  /** Desfaz uma exclusão recente (botão "Desfazer"). */
  restore(userId: string, workspaceId: string, ids: string[]) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWriter(tx, workspaceId);
      const restored = await tx.transaction.updateMany({
        where: { id: { in: ids }, workspaceId, deletedAt: { gte: new Date(Date.now() - 10 * 60_000) } },
        data: { deletedAt: null },
      });
      await this.audit.log(tx, { actorId: userId, workspaceId, entity: 'transaction', action: 'restore', after: { ids } });
      return { restored: restored.count };
    });
  }

  // ---------- apoio ----------

  private async find(tx: Tx, workspaceId: string, id: string): Promise<Row> {
    await requireWorkspace(tx, workspaceId);
    const row = await tx.transaction.findFirst({
      where: { id, workspaceId, deletedAt: null, kind: { in: [...ACCOUNT_KINDS] }, creditCardId: null },
      include: listInclude,
    });
    if (!row) throw new NotFoundException({ error: 'transaction_not_found' });
    return row;
  }

  private async checkRefs(tx: Tx, workspaceId: string, kind: string, accountId: string, categoryId: string | null) {
    const account = await tx.account.findFirst({ where: { id: accountId, workspaceId, archivedAt: null }, select: { id: true } });
    if (!account) throw new BadRequestException({ error: 'invalid_account', message: 'Conta não encontrada neste espaço' });
    if (categoryId) {
      const category = await tx.category.findFirst({ where: { id: categoryId, workspaceId }, select: { kind: true } });
      if (!category) throw new BadRequestException({ error: 'invalid_category', message: 'Categoria não encontrada neste espaço' });
      if (category.kind !== kind) {
        throw new BadRequestException({ error: 'category_kind_mismatch', message: 'A categoria não combina com o tipo do lançamento' });
      }
    }
  }

  private async memberNames(tx: Tx, workspaceId: string) {
    const members = await tx.membership.findMany({ where: { workspaceId }, select: { userId: true, user: { select: { name: true } } } });
    return new Map(members.map((m) => [m.userId, m.user.name]));
  }

  private async today(tx: Tx, workspaceId: string) {
    const ws = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { timezone: true } });
    return todayIn(ws.timezone);
  }

  /** Recorrências sem fim: garante as ocorrências até `upTo` (+ a janela), sem recriar as excluídas. */
  private async extendOpenRecurrences(tx: Tx, workspaceId: string, upTo: string) {
    const open = await tx.transactionSeries.findMany({
      where: { workspaceId, type: 'recurring', endDate: null },
      select: { id: true, startDate: true, template: true, createdBy: true },
    });
    for (const s of open) {
      const last = await tx.transaction.findFirst({
        where: { seriesId: s.id },
        orderBy: { competenceDate: 'desc' },
        select: { competenceDate: true },
      });
      const start = toIsoDate(s.startDate);
      const limit = addMonths(upTo, RECURRING_WINDOW - 1);
      const lastDate = last ? toIsoDate(last.competenceDate) : null;
      const t = s.template as {
        kind: 'income' | 'expense';
        amount: number;
        description: string;
        accountId: string;
        categoryId: string | null;
        notes: string | null;
        ignored: boolean;
      };
      const rows: Prisma.TransactionCreateManyInput[] = [];
      for (let i = 1; i < 600; i++) {
        const date = addMonths(start, i);
        if (date > limit) break;
        if (lastDate && date <= lastDate) continue;
        rows.push({
          workspaceId,
          kind: t.kind,
          amountCents: BigInt(t.amount),
          description: t.description,
          competenceDate: fromIsoDate(date),
          dueDate: fromIsoDate(date),
          status: 'pending',
          ignored: t.ignored,
          notes: t.notes,
          accountId: t.accountId,
          categoryId: t.categoryId,
          seriesId: s.id,
          source: 'recurring',
          createdBy: s.createdBy,
        });
      }
      if (rows.length) await tx.transaction.createMany({ data: rows, skipDuplicates: true });
    }
  }
}
