import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { MemberRole } from '@finflow/shared';
import { AuditService } from '../common/audit.service';
import { hashToken, newOpaqueToken } from '../common/crypto';
import { extractPgCode } from '../common/http-errors';
import { MailerService } from '../common/mailer.service';
import { PrismaService } from '../common/prisma.service';
import { APP_CONFIG, INVITE_TTL_DAYS, type AppConfig } from '../config';
import { requireOwner, requireWorkspace } from './workspaces.service';

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Cria o convite e devolve o link uma única vez (o banco guarda só o hash).
   * Sem provedor de e-mail, quem convida pode mandar o link pelo WhatsApp.
   */
  async create(userId: string, workspaceId: string, email: string, role: Exclude<MemberRole, 'owner'>) {
    const token = newOpaqueToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
    const result = await this.prisma.asUser(userId, async (tx) => {
      const ws = await requireWorkspace(tx, workspaceId);
      if (ws.type === 'personal') {
        throw new BadRequestException({ error: 'personal_workspace', message: 'O espaço Pessoal é só seu. Crie um espaço Casal para convidar.' });
      }
      await requireOwner(tx, workspaceId);
      const inviter = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true } });
      if (inviter.email === email) throw new BadRequestException({ error: 'self_invite', message: 'Você já faz parte deste espaço' });
      const members = await tx.membership.count({ where: { workspaceId } });
      if (members >= 2) throw new ConflictException({ error: 'workspace_full', message: 'O espaço Casal já tem duas pessoas' });

      await tx.invite.updateMany({ where: { workspaceId, email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
      try {
        const invite = await tx.invite.create({
          data: { workspaceId, email, role, tokenHash: hashToken(token), invitedBy: userId, expiresAt },
        });
        await this.audit.log(tx, { actorId: userId, workspaceId, entity: 'invite', entityId: invite.id, action: 'create', after: { email, role } });
        return { id: invite.id, workspaceName: ws.name, inviterName: inviter.name };
      } catch (e) {
        if (extractPgCode(e) === '42501') throw new ForbiddenException({ error: 'owner_only', message: 'Só quem criou o espaço pode convidar' });
        throw e;
      }
    });

    const inviteUrl = `${this.config.WEB_URL}/convite?token=${token}`;
    await this.mailer.send({
      to: email,
      subject: `${result.inviterName} convidou você para o espaço ${result.workspaceName} no FinFlow`,
      text: `Para entrar, abra: ${inviteUrl}\nO convite vale por ${INVITE_TTL_DAYS} dias.`,
    });
    return { id: result.id, email, role, expiresAt, inviteUrl };
  }

  list(userId: string, workspaceId: string) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWorkspace(tx, workspaceId);
      return tx.invite.findMany({
        where: { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  revoke(userId: string, workspaceId: string, inviteId: string) {
    return this.prisma.asUser(userId, async (tx) => {
      await requireWorkspace(tx, workspaceId);
      const updated = await tx.invite.updateMany({
        where: { id: inviteId, workspaceId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (updated.count === 0) throw new NotFoundException({ error: 'invite_not_found' });
      await this.audit.log(tx, { actorId: userId, workspaceId, entity: 'invite', entityId: inviteId, action: 'revoke' });
    });
  }

  preview(userId: string, token: string) {
    return this.prisma.asUser(userId, async (tx) => {
      const rows = await tx.$queryRaw<
        { workspace_name: string; invited_by_name: string; email: string; status: string; expires_at: Date }[]
      >`SELECT * FROM app.invite_preview(${hashToken(token)})`;
      const row = rows[0];
      if (!row) throw new NotFoundException({ error: 'invite_not_found', message: 'Convite não encontrado' });
      return {
        workspaceName: row.workspace_name,
        invitedByName: row.invited_by_name,
        email: row.email,
        status: row.status,
        expiresAt: row.expires_at,
      };
    });
  }

  accept(userId: string, token: string) {
    return this.prisma.asUser(userId, async (tx) => {
      let workspaceId: string;
      try {
        const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT app.accept_invite(${hashToken(token)}) AS id`;
        workspaceId = row!.id;
      } catch (e) {
        const code = extractPgCode(e);
        if (code === 'P0002') throw new NotFoundException({ error: 'invite_invalid', message: 'Convite inválido ou expirado' });
        if (code === '42501') throw new ForbiddenException({ error: 'invite_other_email', message: 'Este convite foi enviado para outro e-mail' });
        if (code === '23514') throw new ConflictException({ error: 'workspace_full', message: 'O espaço já tem duas pessoas' });
        throw e;
      }
      await this.audit.log(tx, { actorId: userId, workspaceId, entity: 'membership', entityId: userId, action: 'accept_invite' });
      return { workspaceId };
    });
  }
}
