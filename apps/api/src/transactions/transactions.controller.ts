import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  createTransactionSchema,
  DELETE_SCOPES,
  isValidMonth,
  payTransactionSchema,
  todayIn,
  updateTransactionSchema,
  type CreateTransactionInput,
  type DeleteScope,
  type UpdateTransactionInput,
} from '@finflow/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth.guard';
import { ZodPipe } from '../common/zod.pipe';
import { TransactionsService } from './transactions.service';

const uuid = new ParseUUIDPipe({ version: '4' });
const restoreSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

@Controller('workspaces/:workspaceId')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get('categories')
  categories(@CurrentUser() user: AuthUser, @Param('workspaceId', uuid) workspaceId: string) {
    return this.transactions.listCategories(user.userId, workspaceId);
  }

  @Get('transactions')
  list(@CurrentUser() user: AuthUser, @Param('workspaceId', uuid) workspaceId: string, @Query('month') month?: string) {
    const m = month ?? todayIn('America/Sao_Paulo').slice(0, 7);
    if (!isValidMonth(m)) throw new BadRequestException({ error: 'invalid_month', message: 'Use o formato AAAA-MM' });
    return this.transactions.list(user.userId, workspaceId, m);
  }

  @Get('transactions/:id')
  get(@CurrentUser() user: AuthUser, @Param('workspaceId', uuid) workspaceId: string, @Param('id', uuid) id: string) {
    return this.transactions.get(user.userId, workspaceId, id);
  }

  @Post('transactions')
  create(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Body(new ZodPipe(createTransactionSchema)) body: CreateTransactionInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.transactions.create(user.userId, workspaceId, body, idempotencyKey);
  }

  @Patch('transactions/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(updateTransactionSchema)) body: UpdateTransactionInput,
  ) {
    return this.transactions.update(user.userId, workspaceId, id, body);
  }

  @Post('transactions/:id/pay')
  pay(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(payTransactionSchema)) body: { paidAt?: string },
  ) {
    return this.transactions.setPaid(user.userId, workspaceId, id, true, body.paidAt);
  }

  @Post('transactions/:id/unpay')
  unpay(@CurrentUser() user: AuthUser, @Param('workspaceId', uuid) workspaceId: string, @Param('id', uuid) id: string) {
    return this.transactions.setPaid(user.userId, workspaceId, id, false);
  }

  @Delete('transactions/:id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('id', uuid) id: string,
    @Query('scope') scope: string = 'this',
  ) {
    if (!(DELETE_SCOPES as readonly string[]).includes(scope)) throw new BadRequestException({ error: 'invalid_scope' });
    return this.transactions.remove(user.userId, workspaceId, id, scope as DeleteScope);
  }

  @Post('transactions/restore')
  restore(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Body(new ZodPipe(restoreSchema)) body: { ids: string[] },
  ) {
    return this.transactions.restore(user.userId, workspaceId, body.ids);
  }
}
