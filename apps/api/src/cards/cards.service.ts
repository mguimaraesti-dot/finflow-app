import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { fromIsoDate, Prisma, toCents, toIsoDate, type Tx } from '@finflow/db';
import {
  addMonths,
  invoiceClosingIn,
  invoiceForPurchase,
  invoiceStatus,
  planCardInstallments,
  shiftMonth,
  todayIn,
  type CardCycle,
  type CreateCardInput,
  type CreateCardPurchaseInput,
  type InvoiceSlot,
  type PayInvoiceInput,
  type UpdateCardInput,
  type UpdateCardPurchaseInput,
} from '@finflow/shared';
import { AuditService } from '../common/audit.service';
import { withIdempotency } from '../common/idempotency';
import { PrismaService } from '../common/prisma.service';
import { requireWorkspace, requireWriter } from '../workspaces/workspaces.service';

const purchaseInclude = {
  category: { select: { id: true, name: true, icon: true } },
  series: { select: { totalInstallments: true, startDate: true } },
} satisfies Prisma.TransactionInclude;

type PurchaseRow = Prisma.TransactionGetPayload<{ include: typeof purchaseInclude }>;

interface Balance {
  invoice_id: string;
  credit_card_id: string;
  total_cents: bigint;
  paid_cents: bigint;
}

type CardRow = Prisma.CreditCardGetPayload<{ include: { paymentAccount: { select: { id: true; name: true } } } }>;

const ym = (iso: string) => iso.slice(0, 7);

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(userId: string, workspaceId: string) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWorkspace(tx, workspaceId);
      const today = await this.today(tx, workspaceId);
      const cards = await tx.creditCard.findMany({
        where: { workspaceId, archivedAt: null },
        include: { paymentAccount: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      });
      const balances = await this.balances(tx, workspaceId);
      return cards.map((card) => {
        const mine = balances.filter((b) => b.card === card.id);
        const used = mine.reduce((s, b) => s + Math.max(b.total - b.paid, 0), 0);
        const slot = invoiceForPurchase(card, today);
        const current = mine.find((b) => b.referenceMonth === slot.referenceMonth);
        const total = current?.total ?? 0;
        const paid = current?.paid ?? 0;
        return {
          ...this.presentCard(card),
          used,
          available: toCents(card.limitCents) - used,
          currentInvoice: {
            month: ym(slot.referenceMonth),
            closingDate: slot.closingDate,
            dueDate: slot.dueDate,
            total,
            paid,
            status: invoiceStatus(card, { referenceMonth: slot.referenceMonth, dueDate: slot.dueDate, total, paid }, today),
          },
          // Faturas já fechadas com saldo devedor: é o que precisa ser pago agora.
          due: mine
            .filter((b) => b.referenceMonth < slot.referenceMonth && b.total - b.paid > 0)
            .map((b) => ({ month: ym(b.referenceMonth), dueDate: b.dueDate, remaining: b.total - b.paid }))
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
        };
      });
    });
  }

  create(userId: string, workspaceId: string, input: CreateCardInput) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWriter(tx, workspaceId);
      await this.checkAccount(tx, workspaceId, input.paymentAccountId);
      const card = await tx.creditCard.create({
        data: {
          workspaceId,
          name: input.name,
          brand: input.brand,
          limitCents: BigInt(input.limit),
          closingDay: input.closingDay,
          dueDay: input.dueDay,
          paymentAccountId: input.paymentAccountId,
        },
        select: { id: true },
      });
      await this.audit.log(tx, { actorId: userId, workspaceId, entity: 'credit_card', entityId: card.id, action: 'create', after: input });
      return { id: card.id };
    });
  }

  update(userId: string, workspaceId: string, cardId: string, input: UpdateCardInput) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWriter(tx, workspaceId);
      const before = await this.findCard(tx, workspaceId, cardId);
      if (input.paymentAccountId) await this.checkAccount(tx, workspaceId, input.paymentAccountId);
      // Novo ciclo vale para faturas ainda não criadas; as existentes mantêm suas datas.
      await tx.creditCard.update({
        where: { id: cardId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.brand !== undefined && { brand: input.brand }),
          ...(input.limit !== undefined && { limitCents: BigInt(input.limit) }),
          ...(input.closingDay !== undefined && { closingDay: input.closingDay }),
          ...(input.dueDay !== undefined && { dueDay: input.dueDay }),
          ...(input.paymentAccountId !== undefined && { paymentAccountId: input.paymentAccountId }),
        },
      });
      await this.audit.log(tx, {
        actorId: userId,
        workspaceId,
        entity: 'credit_card',
        entityId: cardId,
        action: 'update',
        before: this.presentCard(before),
        after: input,
      });
      return { id: cardId };
    });
  }

  archive(userId: string, workspaceId: string, cardId: string) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWriter(tx, workspaceId);
      await this.findCard(tx, workspaceId, cardId);
      await tx.creditCard.update({ where: { id: cardId }, data: { archivedAt: new Date() } });
      await this.audit.log(tx, { actorId: userId, workspaceId, entity: 'credit_card', entityId: cardId, action: 'archive' });
      return { id: cardId };
    });
  }

  /** Fatura de um mês de referência (mês do vencimento). Sem `month`, a fatura aberta. */
  invoice(userId: string, workspaceId: string, cardId: string, month?: string) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWorkspace(tx, workspaceId);
      const card = await this.findCard(tx, workspaceId, cardId, true);
      const today = await this.today(tx, workspaceId);
      const ref = month ?? ym(invoiceForPurchase(card, today).referenceMonth);
      const stored = await tx.invoice.findUnique({
        where: { creditCardId_referenceMonth: { creditCardId: cardId, referenceMonth: fromIsoDate(`${ref}-01`) } },
      });
      const slot = stored
        ? { referenceMonth: toIsoDate(stored.referenceMonth), closingDate: toIsoDate(stored.closingDate), dueDate: toIsoDate(stored.dueDate) }
        : this.slotForMonth(card, ref);

      let total = 0;
      let paid = 0;
      let items: ReturnType<CardsService['presentPurchaseRow']>[] = [];
      let payments: { id: string; amount: number; date: string; account: { id: string; name: string } | null }[] = [];
      if (stored) {
        const b = (await this.balances(tx, workspaceId, stored.id))[0];
        total = b?.total ?? 0;
        paid = b?.paid ?? 0;
        const rows = await tx.transaction.findMany({
          where: { workspaceId, invoiceId: stored.id, deletedAt: null, creditCardId: cardId },
          include: purchaseInclude,
          orderBy: [{ competenceDate: 'desc' }, { createdAt: 'desc' }],
        });
        items = rows.map((r) => this.presentPurchaseRow(r));
        const pays = await tx.transaction.findMany({
          where: { workspaceId, invoiceId: stored.id, deletedAt: null, kind: 'invoice_payment' },
          include: { account: { select: { id: true, name: true } } },
          orderBy: { competenceDate: 'asc' },
        });
        payments = pays.map((p) => ({ id: p.id, amount: toCents(p.amountCents), date: toIsoDate(p.competenceDate), account: p.account }));
      }
      return {
        card: { ...this.presentCard(card), archived: card.archivedAt !== null },
        invoice: {
          id: stored?.id ?? null,
          month: ref,
          closingDate: slot.closingDate,
          dueDate: slot.dueDate,
          total,
          paid,
          remaining: Math.max(total - paid, 0),
          status: invoiceStatus(card, { referenceMonth: slot.referenceMonth, dueDate: slot.dueDate, total, paid }, today),
        },
        items,
        payments,
        prev: shiftMonth(ref, -1),
        next: shiftMonth(ref, 1),
      };
    });
  }

  createPurchase(userId: string, workspaceId: string, cardId: string, input: CreateCardPurchaseInput, idempotencyKey?: string) {
    return this.prisma.asUser(userId, (tx) =>
      withIdempotency(tx, userId, idempotencyKey, { workspaceId, cardId, input }, async () => {
        await requireWriter(tx, workspaceId);
        const card = await this.findCard(tx, workspaceId, cardId);
        await this.checkCategory(tx, workspaceId, input.kind, input.categoryId ?? null);
        const result = await this.writePurchase(tx, userId, workspaceId, card, {
          kind: input.kind,
          amount: input.amount,
          description: input.description,
          date: input.date,
          categoryId: input.categoryId ?? null,
          installments: input.installments,
          notes: input.notes ?? null,
        });
        await this.audit.log(tx, {
          actorId: userId,
          workspaceId,
          entity: 'card_purchase',
          entityId: result.id,
          action: 'create',
          after: { ...input, cardId, seriesId: result.seriesId },
        });
        return result;
      }),
    );
  }

  getPurchase(userId: string, workspaceId: string, id: string) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWorkspace(tx, workspaceId);
      const { rows, first } = await this.findPurchase(tx, workspaceId, id);
      const card = await this.findCard(tx, workspaceId, first.creditCardId!, true);
      return this.presentPurchase(rows, first, card);
    });
  }

  /**
   * Edita a compra inteira (todas as parcelas). Mudar valor, data ou nº de parcelas
   * refaz as parcelas — elas podem mudar de fatura —, e a compra ganha um novo id.
   */
  updatePurchase(userId: string, workspaceId: string, id: string, input: UpdateCardPurchaseInput) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWriter(tx, workspaceId);
      const { rows, first } = await this.findPurchase(tx, workspaceId, id);
      const card = await this.findCard(tx, workspaceId, first.creditCardId!);
      const before = this.presentPurchase(rows, first, card);
      if (input.categoryId !== undefined) await this.checkCategory(tx, workspaceId, first.kind, input.categoryId);

      const replan =
        (input.amount !== undefined && input.amount !== before.amount) ||
        (input.date !== undefined && input.date !== before.date) ||
        (input.installments !== undefined && input.installments !== before.installments);

      let resultId = first.id;
      if (replan) {
        await tx.transaction.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { deletedAt: new Date() } });
        const created = await this.writePurchase(tx, userId, workspaceId, card, {
          kind: first.kind as 'expense' | 'income',
          amount: input.amount ?? before.amount,
          description: input.description ?? before.description,
          date: input.date ?? before.date,
          categoryId: input.categoryId === undefined ? before.category?.id ?? null : input.categoryId,
          installments: input.installments ?? before.installments,
          notes: input.notes === undefined ? before.notes : input.notes,
        });
        resultId = created.id;
      } else {
        await tx.transaction.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: {
            ...(input.description !== undefined && { description: input.description }),
            ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
            ...(input.notes !== undefined && { notes: input.notes }),
          },
        });
      }
      await this.audit.log(tx, {
        actorId: userId,
        workspaceId,
        entity: 'card_purchase',
        entityId: resultId,
        action: 'update',
        before,
        after: { ...input, replaced: replan ? rows.map((r) => r.id) : undefined },
      });
      return { id: resultId };
    });
  }

  /** Exclui a compra com todas as parcelas. Os ids devolvidos servem para "Desfazer". */
  removePurchase(userId: string, workspaceId: string, id: string) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWriter(tx, workspaceId);
      const { rows } = await this.findPurchase(tx, workspaceId, id);
      const ids = rows.map((r) => r.id);
      await tx.transaction.updateMany({ where: { id: { in: ids }, workspaceId }, data: { deletedAt: new Date() } });
      await this.audit.log(tx, { actorId: userId, workspaceId, entity: 'card_purchase', entityId: id, action: 'delete', after: { ids } });
      return { deleted: ids.length, ids };
    });
  }

  /** Pagamento total ou parcial da fatura: sai da conta escolhida, nunca passa do saldo devedor. */
  payInvoice(userId: string, workspaceId: string, cardId: string, month: string, input: PayInvoiceInput, idempotencyKey?: string) {
    return this.prisma.asUser(userId, (tx) =>
      withIdempotency(tx, userId, idempotencyKey, { workspaceId, cardId, month, input }, async () => {
        await requireWriter(tx, workspaceId);
        const card = await this.findCard(tx, workspaceId, cardId, true);
        await this.checkAccount(tx, workspaceId, input.accountId);
        const invoice = await tx.invoice.findUnique({
          where: { creditCardId_referenceMonth: { creditCardId: cardId, referenceMonth: fromIsoDate(`${month}-01`) } },
        });
        const b = invoice ? (await this.balances(tx, workspaceId, invoice.id))[0] : undefined;
        const remaining = b ? b.total - b.paid : 0;
        if (!invoice || remaining <= 0) {
          throw new BadRequestException({ error: 'nothing_to_pay', message: 'Esta fatura não tem saldo a pagar' });
        }
        if (input.amount > remaining) {
          throw new BadRequestException({ error: 'amount_exceeds_remaining', message: 'O valor é maior que o saldo da fatura' });
        }
        const date = input.date ?? (await this.today(tx, workspaceId));
        const payment = await tx.transaction.create({
          data: {
            workspaceId,
            kind: 'invoice_payment',
            amountCents: BigInt(input.amount),
            description: `Fatura ${card.name}`,
            competenceDate: fromIsoDate(date),
            dueDate: invoice.dueDate,
            status: 'paid',
            paidAt: fromIsoDate(date),
            accountId: input.accountId,
            invoiceId: invoice.id,
            createdBy: userId,
          },
          select: { id: true },
        });
        await this.audit.log(tx, {
          actorId: userId,
          workspaceId,
          entity: 'invoice',
          entityId: invoice.id,
          action: 'pay',
          after: { ...input, date, paymentId: payment.id },
        });
        return { id: payment.id, remaining: remaining - input.amount };
      }),
    );
  }

  removePayment(userId: string, workspaceId: string, cardId: string, paymentId: string) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWriter(tx, workspaceId);
      const payment = await tx.transaction.findFirst({
        where: { id: paymentId, workspaceId, kind: 'invoice_payment', deletedAt: null, invoice: { creditCardId: cardId } },
        select: { id: true, invoiceId: true, amountCents: true },
      });
      if (!payment) throw new NotFoundException({ error: 'payment_not_found' });
      await tx.transaction.update({ where: { id: paymentId }, data: { deletedAt: new Date() } });
      await this.audit.log(tx, {
        actorId: userId,
        workspaceId,
        entity: 'invoice',
        entityId: payment.invoiceId,
        action: 'unpay',
        before: { paymentId, amount: toCents(payment.amountCents) },
      });
      return { ids: [paymentId] };
    });
  }

  // ---------- apoio ----------

  private async writePurchase(
    tx: Tx,
    userId: string,
    workspaceId: string,
    card: CardRow,
    p: {
      kind: 'expense' | 'income';
      amount: number;
      description: string;
      date: string;
      categoryId: string | null;
      installments: number;
      notes: string | null;
    },
  ) {
    const plan = planCardInstallments(card, p.date, p.amount, p.installments);
    let seriesId: string | null = null;
    if (p.installments > 1) {
      const series = await tx.transactionSeries.create({
        data: {
          workspaceId,
          type: 'installment',
          frequency: 'monthly',
          startDate: fromIsoDate(p.date),
          totalInstallments: p.installments,
          template: { ...p, creditCardId: card.id },
          createdBy: userId,
        },
        select: { id: true },
      });
      seriesId = series.id;
    }
    const ids: string[] = [];
    for (const [i, inst] of plan.entries()) {
      const invoiceId = await this.ensureInvoice(tx, workspaceId, card.id, inst.invoice);
      const row = await tx.transaction.create({
        data: {
          workspaceId,
          kind: p.kind,
          amountCents: BigInt(inst.amount),
          description: p.description,
          // Competência: parcela n cai n meses depois da compra (para o resumo do mês).
          competenceDate: fromIsoDate(addMonths(p.date, i)),
          dueDate: fromIsoDate(inst.invoice.dueDate),
          status: 'pending',
          paymentMethod: 'credit_card',
          notes: p.notes,
          creditCardId: card.id,
          invoiceId,
          categoryId: p.categoryId,
          seriesId,
          installmentNumber: seriesId ? inst.number : null,
          createdBy: userId,
        },
        select: { id: true },
      });
      ids.push(row.id);
    }
    return { id: ids[0]!, seriesId, count: ids.length };
  }

  private async ensureInvoice(tx: Tx, workspaceId: string, creditCardId: string, slot: InvoiceSlot): Promise<string> {
    const referenceMonth = fromIsoDate(slot.referenceMonth);
    await tx.invoice.createMany({
      data: [
        {
          workspaceId,
          creditCardId,
          referenceMonth,
          closingDate: fromIsoDate(slot.closingDate),
          dueDate: fromIsoDate(slot.dueDate),
        },
      ],
      skipDuplicates: true,
    });
    const inv = await tx.invoice.findUniqueOrThrow({
      where: { creditCardId_referenceMonth: { creditCardId, referenceMonth } },
      select: { id: true },
    });
    return inv.id;
  }

  /** Datas da fatura que vence no mês `month` (yyyy-mm). */
  private slotForMonth(card: CardCycle, month: string): InvoiceSlot {
    // Vence no mesmo mês do fechamento se dueDay > closingDay; senão fechou no mês anterior.
    const closingMonth = card.dueDay > card.closingDay ? month : shiftMonth(month, -1);
    const [y, m] = closingMonth.split('-').map(Number) as [number, number];
    return invoiceClosingIn(card, y, m);
  }

  private async balances(tx: Tx, workspaceId: string, invoiceId?: string) {
    const rows = invoiceId
      ? await tx.$queryRaw<(Balance & { reference_month: Date; due_date: Date })[]>`
          SELECT b.invoice_id, b.credit_card_id, b.total_cents, b.paid_cents, i.reference_month, i.due_date
          FROM invoice_balances b JOIN invoices i ON i.id = b.invoice_id
          WHERE b.workspace_id = ${workspaceId}::uuid AND b.invoice_id = ${invoiceId}::uuid`
      : await tx.$queryRaw<(Balance & { reference_month: Date; due_date: Date })[]>`
          SELECT b.invoice_id, b.credit_card_id, b.total_cents, b.paid_cents, i.reference_month, i.due_date
          FROM invoice_balances b JOIN invoices i ON i.id = b.invoice_id
          WHERE b.workspace_id = ${workspaceId}::uuid`;
    return rows.map((r) => ({
      invoiceId: r.invoice_id,
      card: r.credit_card_id,
      referenceMonth: toIsoDate(r.reference_month),
      dueDate: toIsoDate(r.due_date),
      total: toCents(r.total_cents),
      paid: toCents(r.paid_cents),
    }));
  }

  private async findCard(tx: Tx, workspaceId: string, cardId: string, includeArchived = false): Promise<CardRow> {
    const card = await tx.creditCard.findFirst({
      where: { id: cardId, workspaceId, ...(includeArchived ? {} : { archivedAt: null }) },
      include: { paymentAccount: { select: { id: true, name: true } } },
    });
    if (!card) throw new NotFoundException({ error: 'card_not_found' });
    return card;
  }

  private async findPurchase(tx: Tx, workspaceId: string, id: string) {
    const row = await tx.transaction.findFirst({
      where: { id, workspaceId, deletedAt: null, creditCardId: { not: null } },
      include: purchaseInclude,
    });
    if (!row) throw new NotFoundException({ error: 'purchase_not_found' });
    const rows = row.seriesId
      ? await tx.transaction.findMany({
          where: { workspaceId, seriesId: row.seriesId, deletedAt: null },
          include: purchaseInclude,
          orderBy: { installmentNumber: 'asc' },
        })
      : [row];
    return { rows, first: rows[0]! };
  }

  private presentCard(card: CardRow) {
    return {
      id: card.id,
      name: card.name,
      brand: card.brand,
      limit: toCents(card.limitCents),
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      paymentAccount: card.paymentAccount,
    };
  }

  private presentPurchaseRow(r: PurchaseRow) {
    return {
      id: r.id,
      kind: r.kind,
      amount: toCents(r.amountCents),
      description: r.description,
      date: r.series ? toIsoDate(r.series.startDate) : toIsoDate(r.competenceDate),
      category: r.category,
      installment: r.seriesId ? { number: r.installmentNumber, total: r.series?.totalInstallments ?? null } : null,
    };
  }

  private presentPurchase(rows: PurchaseRow[], first: PurchaseRow, card: CardRow) {
    return {
      id: first.id,
      kind: first.kind,
      amount: rows.reduce((s, r) => s + toCents(r.amountCents), 0),
      description: first.description,
      date: first.series ? toIsoDate(first.series.startDate) : toIsoDate(first.competenceDate),
      category: first.category,
      notes: first.notes,
      installments: rows.length,
      card: { id: card.id, name: card.name },
      parts: rows.map((r) => ({ id: r.id, number: r.installmentNumber, amount: toCents(r.amountCents), invoiceId: r.invoiceId })),
    };
  }

  private async checkAccount(tx: Tx, workspaceId: string, accountId: string) {
    const account = await tx.account.findFirst({ where: { id: accountId, workspaceId, archivedAt: null }, select: { id: true } });
    if (!account) throw new BadRequestException({ error: 'invalid_account', message: 'Conta não encontrada neste espaço' });
  }

  private async checkCategory(tx: Tx, workspaceId: string, kind: string, categoryId: string | null) {
    if (!categoryId) return;
    const category = await tx.category.findFirst({ where: { id: categoryId, workspaceId }, select: { kind: true } });
    if (!category) throw new BadRequestException({ error: 'invalid_category', message: 'Categoria não encontrada neste espaço' });
    if (category.kind !== kind) {
      throw new BadRequestException({ error: 'category_kind_mismatch', message: 'A categoria não combina com o tipo da compra' });
    }
  }

  private async today(tx: Tx, workspaceId: string) {
    const ws = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { timezone: true } });
    return todayIn(ws.timezone);
  }
}
