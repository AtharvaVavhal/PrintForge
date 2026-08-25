import { Injectable, OnModuleInit } from '@nestjs/common';
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
  private client: Razorpay;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    const config = this.configService.get('razorpay', { infer: true });
    this.client = new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret,
    });
  }

  // TODO(payments): createOrder(), verifySignature() (HMAC using
  // RAZORPAY_KEY_SECRET), verifyWebhookSignature() (HMAC using
  // RAZORPAY_WEBHOOK_SECRET — a distinct secret, §12).
}
