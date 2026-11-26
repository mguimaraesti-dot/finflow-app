import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  createCardPurchaseSchema,
  createCardSchema,
  isValidMonth,
  payInvoiceSchema,
  updateCardPurchaseSchema,
  updateCardSchema,
  type CreateCardInput,
  type CreateCardPurchaseInput,
  type PayInvoiceInput,
  type UpdateCardInput,
  type UpdateCardPurchaseInput,
} from '@finflow/shared';
import { CurrentUser, type AuthUser } from '../common/auth.guard';
import { ZodPipe } from '../common/zod.pipe';
import { CardsService } from './cards.service';

const uuid = new ParseUUIDPipe({ version: '4' });

function month(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!isValidMonth(value)) throw new BadRequestException({ error: 'invalid_month', message: 'Use o formato AAAA-MM' });
  return value;
}

@Controller('workspaces/:workspaceId')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get('cards')
  list(@CurrentUser() user: AuthUser, @Param('workspaceId', uuid) workspaceId: string) {
    return this.cards.list(user.userId, workspaceId);
  }

  @Post('cards')
  create(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Body(new ZodPipe(createCardSchema)) body: CreateCardInput,
  ) {
    return this.cards.create(user.userId, workspaceId, body);
  }

  @Patch('cards/:cardId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('cardId', uuid) cardId: string,
    @Body(new ZodPipe(updateCardSchema)) body: UpdateCardInput,
  ) {
    return this.cards.update(user.userId, workspaceId, cardId, body);
  }

  @Post('cards/:cardId/archive')
  archive(@CurrentUser() user: AuthUser, @Param('workspaceId', uuid) workspaceId: string, @Param('cardId', uuid) cardId: string) {
    return this.cards.archive(user.userId, workspaceId, cardId);
  }

  @Get('cards/:cardId/invoice')
  invoice(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('cardId', uuid) cardId: string,
    @Query('month') m?: string,
  ) {
    return this.cards.invoice(user.userId, workspaceId, cardId, month(m));
  }

  @Post('cards/:cardId/invoices/:month/pay')
  pay(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('cardId', uuid) cardId: string,
    @Param('month') m: string,
    @Body(new ZodPipe(payInvoiceSchema)) body: PayInvoiceInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.cards.payInvoice(user.userId, workspaceId, cardId, month(m)!, body, idempotencyKey);
  }

  @Delete('cards/:cardId/payments/:paymentId')
  removePayment(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('cardId', uuid) cardId: string,
    @Param('paymentId', uuid) paymentId: string,
  ) {
    return this.cards.removePayment(user.userId, workspaceId, cardId, paymentId);
  }

  @Post('cards/:cardId/purchases')
  createPurchase(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('cardId', uuid) cardId: string,
    @Body(new ZodPipe(createCardPurchaseSchema)) body: CreateCardPurchaseInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.cards.createPurchase(user.userId, workspaceId, cardId, body, idempotencyKey);
  }

  @Get('purchases/:id')
  getPurchase(@CurrentUser() user: AuthUser, @Param('workspaceId', uuid) workspaceId: string, @Param('id', uuid) id: string) {
    return this.cards.getPurchase(user.userId, workspaceId, id);
  }

  @Patch('purchases/:id')
  updatePurchase(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(updateCardPurchaseSchema)) body: UpdateCardPurchaseInput,
  ) {
    return this.cards.updatePurchase(user.userId, workspaceId, id, body);
  }

  @Delete('purchases/:id')
  removePurchase(@CurrentUser() user: AuthUser, @Param('workspaceId', uuid) workspaceId: string, @Param('id', uuid) id: string) {
    return this.cards.removePurchase(user.userId, workspaceId, id);
  }
}
