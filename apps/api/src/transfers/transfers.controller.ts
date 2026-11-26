import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { createTransferSchema, updateTransferSchema, type CreateTransferInput, type UpdateTransferInput } from '@finflow/shared';
import { CurrentUser, type AuthUser } from '../common/auth.guard';
import { ZodPipe } from '../common/zod.pipe';
import { TransfersService } from './transfers.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('workspaces/:workspaceId/transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Body(new ZodPipe(createTransferSchema)) body: CreateTransferInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.transfers.create(user.userId, workspaceId, body, idempotencyKey);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('workspaceId', uuid) workspaceId: string, @Param('id', uuid) id: string) {
    return this.transfers.get(user.userId, workspaceId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(updateTransferSchema)) body: UpdateTransferInput,
  ) {
    return this.transfers.update(user.userId, workspaceId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('workspaceId', uuid) workspaceId: string, @Param('id', uuid) id: string) {
    return this.transfers.remove(user.userId, workspaceId, id);
  }
}
