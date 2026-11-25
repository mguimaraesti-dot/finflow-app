import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { acceptInviteSchema, createInviteSchema, createSharedWorkspaceSchema } from '@finflow/shared';
import { CurrentUser, type AuthUser } from '../common/auth.guard';
import { ZodPipe } from '../common/zod.pipe';
import { InvitesService } from './invites.service';
import { WorkspacesService } from './workspaces.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller()
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly invites: InvitesService,
  ) {}

  @Get('workspaces')
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.list(user.userId);
  }

  @Post('workspaces')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createSharedWorkspaceSchema)) body: { name: string }) {
    this.workspaces.assertNotDuplicateName(body.name);
    return this.workspaces.createShared(user.userId, body.name);
  }

  @Patch('workspaces/:id')
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(createSharedWorkspaceSchema)) body: { name: string },
  ) {
    return this.workspaces.rename(user.userId, id, body.name);
  }

  @HttpCode(204)
  @Delete('workspaces/:id/members/:userId')
  removeMember(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Param('userId', uuid) memberId: string) {
    return this.workspaces.removeMember(user.userId, id, memberId);
  }

  @Post('workspaces/:id/invites')
  invite(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(createInviteSchema)) body: { email: string; role: 'editor' | 'viewer' },
  ) {
    return this.invites.create(user.userId, id, body.email, body.role);
  }

  @Get('workspaces/:id/invites')
  listInvites(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.invites.list(user.userId, id);
  }

  @HttpCode(204)
  @Delete('workspaces/:id/invites/:inviteId')
  revokeInvite(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Param('inviteId', uuid) inviteId: string) {
    return this.invites.revoke(user.userId, id, inviteId);
  }

  @HttpCode(200)
  @Post('invites/preview')
  preview(@CurrentUser() user: AuthUser, @Body(new ZodPipe(acceptInviteSchema)) body: { token: string }) {
    return this.invites.preview(user.userId, body.token);
  }

  @HttpCode(200)
  @Post('invites/accept')
  accept(@CurrentUser() user: AuthUser, @Body(new ZodPipe(acceptInviteSchema)) body: { token: string }) {
    return this.invites.accept(user.userId, body.token);
  }
}
