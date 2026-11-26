import { Controller, Get, Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountsController } from './accounts/accounts.controller';
import { AccountsService } from './accounts/accounts.service';
import { AuthController } from './auth/auth.controller';
import { CardsController } from './cards/cards.controller';
import { CardsService } from './cards/cards.service';
import { TransfersController } from './transfers/transfers.controller';
import { TransfersService } from './transfers/transfers.service';
import { TransactionsController } from './transactions/transactions.controller';
import { TransactionsService } from './transactions/transactions.service';
import { AuthService } from './auth/auth.service';
import { AuditService } from './common/audit.service';
import { AuthGuard, Public } from './common/auth.guard';
import { HttpErrorFilter } from './common/http-errors';
import { MailerService } from './common/mailer.service';
import { PrismaService } from './common/prisma.service';
import { APP_CONFIG, type AppConfig } from './config';
import { InvitesService } from './workspaces/invites.service';
import { WorkspacesController } from './workspaces/workspaces.controller';
import { WorkspacesService } from './workspaces/workspaces.service';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.client.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        JwtModule.register({ secret: config.JWT_ACCESS_SECRET, signOptions: { algorithm: 'HS256' } }),
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: config.NODE_ENV === 'test' ? 10_000 : 120 }],
          skipIf: () => config.NODE_ENV === 'test',
        }),
      ],
      controllers: [HealthController, AuthController, WorkspacesController, AccountsController, TransactionsController, CardsController, TransfersController],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        PrismaService,
        AuditService,
        MailerService,
        AuthService,
        WorkspacesService,
        InvitesService,
        AccountsService,
        TransactionsService,
        CardsService,
        TransfersService,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: HttpErrorFilter },
      ],
    };
  }
}
