import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import type { LoginInput, RegisterInput } from '@finflow/shared';
import { Prisma, type Tx } from '@finflow/db';
import { AuditService } from '../common/audit.service';
import type { ClientInfo } from '../common/auth.guard';
import { hashToken, newOpaqueToken } from '../common/crypto';
import { MailerService } from '../common/mailer.service';
import { PrismaService } from '../common/prisma.service';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  APP_CONFIG,
  PASSWORD_RESET_TTL_MINUTES,
  REFRESH_TOKEN_TTL_DAYS,
  type AppConfig,
} from '../config';
import { seedDefaultCategories } from '../workspaces/default-categories';

// Parâmetros recomendados pela OWASP para Argon2id.
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
// Hash calculado uma vez para comparar quando o e-mail não existe: o tempo de resposta não denuncia quem tem conta.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hash('finflow-dummy-password', ARGON));

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async register(input: RegisterInput, client: ClientInfo): Promise<TokenPair> {
    const userId = randomUUID();
    const passwordHash = await hash(input.password, ARGON);
    try {
      return await this.prisma.asUser(userId, async (tx) => {
        await tx.user.create({ data: { id: userId, email: input.email, name: input.name, passwordHash } });
        const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT app.create_workspace('Pessoal', 'personal') AS id`;
        await seedDefaultCategories(tx, row!.id);
        await tx.consent.create({ data: { userId, purpose: 'terms_and_privacy', version: '2026-11' } });
        await this.audit.log(tx, { actorId: userId, entity: 'user', entityId: userId, action: 'register', ip: client.ip });
        return this.issueTokens(tx, userId, client);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ error: 'email_taken', message: 'Já existe uma conta com este e-mail' });
      }
      throw e;
    }
  }

  async login(input: LoginInput, client: ClientInfo): Promise<TokenPair> {
    const user = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    const ok = await verify(user?.passwordHash ?? (await getDummyHash()), input.password).catch(() => false);
    if (!user || !ok) {
      await this.audit.log(this.prisma.client, {
        actorId: null,
        entity: 'user',
        action: 'login_failed',
        after: { email: input.email },
        ip: client.ip,
      });
      throw new UnauthorizedException({ error: 'invalid_credentials', message: 'E-mail ou senha incorretos' });
    }
    return this.prisma.asUser(user.id, async (tx) => {
      await this.audit.log(tx, { actorId: user.id, entity: 'user', entityId: user.id, action: 'login', ip: client.ip });
      return this.issueTokens(tx, user.id, client);
    });
  }

  /**
   * Troca o refresh token por um par novo. Se um token já trocado for reapresentado,
   * assume vazamento e encerra todas as sessões da pessoa.
   */
  async refresh(refreshToken: string, client: ClientInfo): Promise<TokenPair> {
    const tokenHash = hashToken(refreshToken);
    const session = await this.prisma.client.session.findUnique({ where: { refreshTokenHash: tokenHash } });
    if (!session) throw new UnauthorizedException({ error: 'invalid_refresh' });

    if (session.revokedAt) {
      if (session.replacedById) {
        await this.prisma.asUser(session.userId, async (tx) => {
          await tx.session.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: new Date() } });
          await this.audit.log(tx, { actorId: session.userId, entity: 'session', entityId: session.id, action: 'refresh_reuse_detected', ip: client.ip });
        });
      }
      throw new UnauthorizedException({ error: 'invalid_refresh' });
    }
    if (session.expiresAt < new Date()) throw new UnauthorizedException({ error: 'expired_refresh' });

    return this.prisma.asUser(session.userId, async (tx) => {
      // Revoga só se ainda não foi revogada: duas trocas simultâneas não geram dois pares válidos.
      const revoked = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) throw new UnauthorizedException({ error: 'invalid_refresh' });
      const pair = await this.issueTokens(tx, session.userId, client);
      const created = await tx.session.findUniqueOrThrow({ where: { refreshTokenHash: hashToken(pair.refreshToken) } });
      await tx.session.update({ where: { id: session.id }, data: { replacedById: created.id } });
      return pair;
    });
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.prisma.asUser(userId, async (tx) => {
      await tx.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(tx, { actorId: userId, entity: 'session', entityId: sessionId, action: 'logout' });
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.asUser(userId, async (tx) => {
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(tx, { actorId: userId, entity: 'session', action: 'logout_all' });
    });
  }

  async me(userId: string) {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, emailVerifiedAt: true, mfaEnabledAt: true, createdAt: true },
    });
    return user;
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.client.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true },
    });
    return sessions.map((s) => ({ ...s, current: s.id === currentSessionId }));
  }

  /** Sempre responde igual, exista ou não a conta (não revela quem tem cadastro). */
  async forgotPassword(email: string, client: ClientInfo): Promise<void> {
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) return;
    const token = newOpaqueToken();
    await this.prisma.asUser(user.id, async (tx) => {
      await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      await tx.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
        },
      });
      await this.audit.log(tx, { actorId: user.id, entity: 'user', entityId: user.id, action: 'password_reset_requested', ip: client.ip });
    });
    await this.mailer.send({
      to: user.email,
      subject: 'Redefinir sua senha do FinFlow',
      text: `Para criar uma nova senha, abra: ${this.config.WEB_URL}/redefinir-senha?token=${token}\nO link vale por ${PASSWORD_RESET_TTL_MINUTES} minutos. Se não foi você, ignore este e-mail.`,
    });
  }

  async resetPassword(token: string, password: string, client: ClientInfo): Promise<void> {
    const reset = await this.prisma.client.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new UnauthorizedException({ error: 'invalid_reset_token', message: 'Link inválido ou expirado' });
    }
    const passwordHash = await hash(password, ARGON);
    await this.prisma.asUser(reset.userId, async (tx) => {
      const used = await tx.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count !== 1) throw new UnauthorizedException({ error: 'invalid_reset_token' });
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.session.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log(tx, { actorId: reset.userId, entity: 'user', entityId: reset.userId, action: 'password_reset', ip: client.ip });
    });
  }

  private async issueTokens(tx: Tx, userId: string, client: ClientInfo): Promise<TokenPair> {
    const refreshToken = newOpaqueToken();
    const session = await tx.session.create({
      data: {
        userId,
        refreshTokenHash: hashToken(refreshToken),
        userAgent: client.userAgent,
        ip: client.ip,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      },
    });
    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: session.id, typ: 'access' },
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS, algorithm: 'HS256' },
    );
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }
}
