import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { createAppClient, PrismaClient, withUser, type Tx } from '@finflow/db';
import { APP_CONFIG, type AppConfig } from '../config';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = createAppClient(config.DATABASE_URL_APP);
  }

  /** Executa em transação com o usuário definido para o Row-Level Security. */
  asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return withUser(this.client, userId, fn);
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
