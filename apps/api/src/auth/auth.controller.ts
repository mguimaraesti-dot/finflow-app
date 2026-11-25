import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  type LoginInput,
  type RegisterInput,
} from '@finflow/shared';
import { ClientInfo, CurrentUser, Public, type AuthUser } from '../common/auth.guard';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body(new ZodPipe(registerSchema)) body: RegisterInput, @ClientInfo() client: ClientInfo) {
    return this.auth.register(body, client);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @ClientInfo() client: ClientInfo) {
    return this.auth.login(body, client);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body(new ZodPipe(refreshSchema)) body: { refreshToken: string }, @ClientInfo() client: ClientInfo) {
    return this.auth.refresh(body.refreshToken, client);
  }

  @HttpCode(204)
  @Post('logout')
  logout(@CurrentUser() user: AuthUser) {
    return this.auth.logout(user.sessionId, user.userId);
  }

  @HttpCode(204)
  @Post('logout-all')
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.auth.logoutAll(user.userId);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user.userId, user.sessionId);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(202)
  @Post('forgot-password')
  async forgot(@Body(new ZodPipe(forgotPasswordSchema)) body: { email: string }, @ClientInfo() client: ClientInfo) {
    await this.auth.forgotPassword(body.email, client);
    return { message: 'Se houver uma conta com este e-mail, enviamos um link para redefinir a senha.' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Post('reset-password')
  reset(@Body(new ZodPipe(resetPasswordSchema)) body: { token: string; password: string }, @ClientInfo() client: ClientInfo) {
    return this.auth.resetPassword(body.token, body.password, client);
  }
}
