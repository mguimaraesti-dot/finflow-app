import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@finflow/db';
import type { Response } from 'express';

/** Converte erros do banco em respostas previsíveis, sem vazar detalhes internos. */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      res.status(exception.getStatus()).json(typeof body === 'string' ? { error: body } : body);
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        res.status(409).json({ error: 'conflict', message: 'Já existe um registro com esses dados' });
        return;
      }
      if (exception.code === 'P2025') {
        res.status(404).json({ error: 'not_found' });
        return;
      }
    }

    const pgCode = extractPgCode(exception);
    if (pgCode === '42501') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    res.status(500).json({ error: 'internal_error', message: 'Erro inesperado' });
  }
}

export function extractPgCode(e: unknown): string | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = e.meta as { code?: string } | undefined;
    if (meta?.code) return meta.code;
    const m = /Code: `([0-9A-Z]{5})`/.exec(e.message) ?? /SQLSTATE[^0-9A-Z]*([0-9A-Z]{5})/.exec(e.message);
    return m?.[1] ?? null;
  }
  if (e instanceof Error) {
    const m = /Code: `([0-9A-Z]{5})`/.exec(e.message);
    return m?.[1] ?? null;
  }
  return null;
}
