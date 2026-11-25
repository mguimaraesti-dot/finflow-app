import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig, type AppConfig } from './config';

export async function createApp(config: AppConfig) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {
    logger: config.NODE_ENV === 'test' ? ['error'] : ['log', 'warn', 'error'],
  });
  app.set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({ origin: config.API_CORS_ORIGIN.split(','), credentials: false });
  app.useBodyParser('json', { limit: '100kb' });
  app.enableShutdownHooks();
  return app;
}

async function bootstrap() {
  const config = loadConfig();
  const app = await createApp(config);
  await app.listen(config.API_PORT);
}

if (require.main === module) {
  void bootstrap();
}
