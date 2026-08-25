import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { AppConfig } from '../../common/config/configuration';

/**
 * Thin wrapper around the Razorpay SDK. Razorpay order is created once per
 * Order and reused across retries (§12) — never re-created on
 * retry-payment.
 */
@Injectable()
export class RazorpayService implements OnModuleInit {
  private readonly logger = new Logger(RazorpayService.name);
  private client: Razorpay | undefined;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    const config = this.configService.get('razorpay', { infer: true });

    if (!config.keyId || !config.keySecret) {
      // Missing keys must not be fatal at boot — other phases (e.g. auth)
      // need the app to start without Razorpay configured yet. Any method
      // that actually needs the client fails loudly via getClient() below,
      // at call time, not here.
      this.logger.warn(
        'RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET not set — Razorpay client not initialized. Payment endpoints will fail until configured.',
      );
      return;
    }

    this.client = new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret,
    });
  }

  /**
   * Every method that needs the Razorpay SDK must go through this instead
   * of touching `client` directly, so "not configured" fails at the point
   * of use, not at boot.
   */
  private getClient(): Razorpay {
    if (!this.client) {
      throw new Error(
        'Razorpay client is not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      );
    }
    return this.client;
  }

  // TODO(payments): createOrder(), verifySignature() (HMAC using
  // RAZORPAY_KEY_SECRET), verifyWebhookSignature() (HMAC using
  // RAZORPAY_WEBHOOK_SECRET — a distinct secret, §12). Each must call
  // getClient() rather than referencing `client` directly.
}
