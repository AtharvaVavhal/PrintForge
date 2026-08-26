import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { AppConfig } from '../../common/config/configuration';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Thin wrapper around the Resend SDK, mirroring RazorpayService's
 * lazy-client pattern from Phase 6 — missing config must not be fatal at
 * boot (other phases need the app to start without Resend configured),
 * any method that actually needs the client fails loudly at call time.
 * Called only by OutboxPoller, never inline inside a request transaction
 * (§17: email failure is architecturally incapable of reverting order/
 * payment state).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private client: Resend | undefined;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const config = this.configService.get('resend', { infer: true });
    this.fromAddress = config.emailFromAddress;
    if (!config.apiKey) {
      this.logger.warn(
        'RESEND_API_KEY not set — outbound email is disabled; the outbox poller will retry-then-fail these events until configured.',
      );
      return;
    }
    this.client = new Resend(config.apiKey);
  }

  async send(params: SendEmailParams): Promise<void> {
    if (!this.client) {
      throw new Error('Resend is not configured — set RESEND_API_KEY.');
    }
    const result = await this.client.emails.send({
      from: this.fromAddress,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    if (result.error) {
      throw new Error(`Resend send failed: ${result.error.message}`);
    }
  }
}
