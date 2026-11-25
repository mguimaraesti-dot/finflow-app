import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createAccountSchema, type CreateAccountInput } from '@finflow/shared';
import { CurrentUser, type AuthUser } from '../common/auth.guard';
import { ZodPipe } from '../common/zod.pipe';
import { AccountsService } from './accounts.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('workspaces/:workspaceId/accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('workspaceId', uuid) workspaceId: string) {
    return this.accounts.list(user.userId, workspaceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Body(new ZodPipe(createAccountSchema)) body: CreateAccountInput,
  ) {
    return this.accounts.create(user.userId, workspaceId, body);
  }
}
