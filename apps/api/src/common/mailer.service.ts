import { Injectable, Logger } from '@nestjs/common';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Envio de e-mail. Enquanto não há provedor (fase de uso pessoal), registra no log
 * sem o corpo e guarda a última mensagem em memória para testes e desenvolvimento.
 * Trocar por um provedor (SES, Resend) é implementar `send`.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger('Mailer');
  readonly outbox: Mail[] = [];

  async send(mail: Mail): Promise<void> {
    this.outbox.push(mail);
    if (this.outbox.length > 50) this.outbox.shift();
    this.logger.log(`E-mail para ${mail.to.replace(/(.).+@/, '$1***@')}: ${mail.subject}`);
  }
}
