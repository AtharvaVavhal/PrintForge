import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { AppConfig } from '../../common/config/configuration';

export interface CreateRazorpayOrderParams {
  /** Bigint paise — converted to a decimal string, never a float (see completion report). */
  amountPaise: bigint;
  currency: string;
  receipt: string;
}

export interface VerifyPaymentSignatureParams {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface CreateRefundParams {
  razorpayPaymentId: string;
  /** Bigint paise. Unlike createOrder, Razorpay's refund API requires a
   * plain `number` (no string alternative) — see createRefund's guard. */
  amountPaise: bigint;
  reason?: string;
}

export interface RazorpayRefundResult {
  id: string;
  status: 'pending' | 'processed' | 'failed';
}

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

  /** Public key id — safe to hand to the frontend's Checkout.js widget. */
  getKeyId(): string {
    const config = this.configService.get('razorpay', { infer: true });
    if (!config.keyId) {
      throw new Error('RAZORPAY_KEY_ID is not configured.');
    }
    return config.keyId;
  }

  async createOrder(
    params: CreateRazorpayOrderParams,
  ): Promise<{ id: string }> {
    const client = this.getClient();
    // Passed as a decimal STRING, never Number(bigint) — the SDK's `amount`
    // field accepts `number | string`; a string sidesteps any bigint→float
    // precision question entirely (see completion report).
    const order = await client.orders.create({
      amount: params.amountPaise.toString(),
      currency: params.currency,
      receipt: params.receipt,
    });
    return { id: order.id };
  }

  /**
   * Not currently called by anything (kept for a genuinely future phase —
   * cheap to leave in place). §12.5 as originally frozen: "no in-app
   * refund-initiation API in MVP." An initial Phase 7 pass wired
   * order-cancellation to call this directly; that was reverted back to
   * the frozen "record only, refund processed manually in the Razorpay
   * dashboard" design — see OrdersService.performCancellation, which now
   * just flags a Refund row PENDING instead. Unlike createOrder, the
   * SDK's refund `amount` field is `number` only (no string escape
   * hatch), so a real bigint→number conversion happens here; guarded
   * against precision loss rather than silently trusted, even though
   * unreachable at this app's order sizes.
   */
  async createRefund(
    params: CreateRefundParams,
  ): Promise<RazorpayRefundResult> {
    const client = this.getClient();
    if (params.amountPaise > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(
        `Refund amount ${params.amountPaise.toString()} paise exceeds safe integer precision for the Razorpay SDK`,
      );
    }
    const refund = await client.payments.refund(params.razorpayPaymentId, {
      amount: Number(params.amountPaise),
      notes: params.reason ? { reason: params.reason } : undefined,
    });
    return { id: refund.id, status: refund.status };
  }

  /**
   * Frontend-callback path (§12.1): `hmac_sha256(orderId|paymentId,
   * key_secret)`. A valid signature is itself the proof of a successful
   * capture — only Razorpay's servers, holding key_secret, can produce it.
   */
  verifySignature(params: VerifyPaymentSignatureParams): boolean {
    const config = this.configService.get('razorpay', { infer: true });
    if (!config.keySecret) {
      throw new Error('RAZORPAY_KEY_SECRET is not configured.');
    }
    const expected = this.hmacSha256Hex(
      `${params.razorpayOrderId}|${params.razorpayPaymentId}`,
      config.keySecret,
    );
    return this.timingSafeEqualHex(expected, params.razorpaySignature);
  }

  /**
   * Webhook path (§12.3): `hmac_sha256(rawRequestBody, webhook_secret)` —
   * a distinct secret from key_secret. `rawBody` must be the exact
   * undecoded bytes Razorpay signed (see main.ts's `rawBody: true`), not a
   * re-serialized JSON.stringify of the parsed body.
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const config = this.configService.get('razorpay', { infer: true });
    if (!config.webhookSecret) {
      throw new Error(
        'RAZORPAY_WEBHOOK_SECRET is not configured — cannot verify webhook signatures.',
      );
    }
    const expected = this.hmacSha256Hex(rawBody, config.webhookSecret);
    return this.timingSafeEqualHex(expected, signature);
  }

  private hmacSha256Hex(message: string, secret: string): string {
    return createHmac('sha256', secret).update(message).digest('hex');
  }

  /** Constant-time comparison — the SDK's own equivalent uses plain `===`. */
  private timingSafeEqualHex(expectedHex: string, actualHex: string): boolean {
    const expected = Buffer.from(expectedHex, 'utf8');
    const actual = Buffer.from(actualHex, 'utf8');
    if (expected.length !== actual.length) {
      return false;
    }
    return timingSafeEqual(expected, actual);
  }
}
