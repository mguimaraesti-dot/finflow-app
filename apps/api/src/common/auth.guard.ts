import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface AuthUser {
  userId: string;
  sessionId: string;
}

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

type AuthedRequest = Request & { user?: AuthUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException({ error: 'unauthenticated' });
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; sid: string; typ: string }>(header.slice(7), {
        algorithms: ['HS256'],
      });
      if (payload.typ !== 'access') throw new Error('tipo de token inválido');
      req.user = { userId: payload.sub, sessionId: payload.sid };
      return true;
    } catch {
      throw new UnauthorizedException({ error: 'invalid_token' });
    }
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new UnauthorizedException({ error: 'unauthenticated' });
  return req.user;
});

export const ClientInfo = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent']?.slice(0, 300) ?? null };
});
export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}
