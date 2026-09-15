import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PaymentProviderType } from '@prisma/client';
import Razorpay from 'razorpay';
import { CredentialEncryptionService } from '../crypto/credential-encryption.service';
import {
  CreateMerchantOrderParams,
  CreateMerchantRefundParams,
  MerchantOrderPayment,
  MerchantOrderResult,
  MerchantRefundResult,
  PaymentProviderAdapter,
  VerifyMerchantPaymentParams,
} from '../providers/payment-provider-adapter.interface';
import {
  PaymentProviderApiError,
  PaymentProviderCredentialError,
} from '../providers/payment-provider.errors';

interface RazorpayMerchantCredentials {
  keyId: string;
  keySecret: string;
  /** Distinct from `keySecret` — Razorpay signs webhook payloads with a
   * separately-configured secret. Optional: a merchant may have connected
   * an account (keyId/keySecret verified) without yet configuring a
   * webhook secret in the Razorpay dashboard. */
  webhookSecret?: string;
}

/**
 * Phase 8 (P8-8) — the concrete Razorpay `PaymentProviderAdapter`
 * implementation, operating exclusively on merchant `PaymentAccount`
 * credentials. Deliberately has NO dependency on `ConfigService`/
 * `AppConfig`, and does not import `../razorpay.service` (the Phase 7
 * SaaS-Tenant-#1-seed/global-credential singleton) or the SaaS billing
 * `RazorpayBillingProvider` — this is what makes it structurally
 * impossible for this adapter to ever read `RAZORPAY_KEY_ID`/
 * `RAZORPAY_SAAS_*`/any process-level Razorpay config: the only credential
 * input any method accepts is the caller-supplied `encryptedCredentials`
 * buffer for the ONE resolved `PaymentAccount` the caller is operating on
 * (task scope items 2–4, 11).
 *
 * Client construction (task scope item 3): a fresh `Razorpay` SDK client
 * is built from-scratch inside every method call, from that call's own
 * decrypted credentials — never a cached/shared field, never reused
 * across calls. Two calls with two different accounts' credentials are
 * fully independent; there is no instance state a second call could ever
 * read from a first (task scope item 4 — no cross-account/cross-store
 * credential use is possible by construction, not by discipline).
 *
 * Decryption boundary (P8-D6 §7): this class is the ONLY place merchant
 * commerce credentials are ever decrypted, and only at the moment of an
 * actual provider call — mirrors `RazorpayAccountVerifierService`'s
 * identical boundary for the connection-verification path. Every method
 * returns only provider-assigned ids/status strings; none ever returns,
 * logs, or embeds credential material in a thrown error (task scope item
 * 8 — see `translateSdkError`/`decryptCredentials` below).
 */
@Injectable()
export class RazorpayProviderAdapter implements PaymentProviderAdapter {
  readonly provider = PaymentProviderType.RAZORPAY;
  private readonly logger = new Logger(RazorpayProviderAdapter.name);

  constructor(
    private readonly credentialEncryption: CredentialEncryptionService,
  ) {}

  getPublicKeyId(encryptedCredentials: Buffer): string {
    return this.decryptCredentials(encryptedCredentials).keyId;
  }

  async createOrder(
    encryptedCredentials: Buffer,
    params: CreateMerchantOrderParams,
  ): Promise<MerchantOrderResult> {
    const client = this.buildClient(encryptedCredentials);
    let order: { id: string };
    try {
      // Amount passed as a decimal STRING, never Number(bigint) — same
      // bigint-paise discipline as `RazorpayService.createOrder`.
      order = await client.orders.create({
        amount: params.amountPaise.toString(),
        currency: params.currency,
        receipt: params.receipt,
      });
    } catch (err: unknown) {
      throw this.translateSdkError('createOrder', err);
    }
    if (!order?.id) {
      throw new PaymentProviderApiError(
        'Razorpay order creation returned no order id',
        this.provider,
        undefined,
        undefined,
        false,
      );
    }
    return { providerOrderId: order.id };
  }

  verifyPaymentSignature(
    encryptedCredentials: Buffer,
    params: VerifyMerchantPaymentParams,
  ): boolean {
    const credentials = this.decryptCredentials(encryptedCredentials);
    const expected = this.hmacSha256Hex(
      `${params.providerOrderId}|${params.providerPaymentId}`,
      credentials.keySecret,
    );
    return this.timingSafeEqualHex(expected, params.providerSignature);
  }

  verifyWebhookSignature(
    encryptedCredentials: Buffer,
    rawBody: string,
    signature: string,
  ): boolean {
    const credentials = this.decryptCredentials(encryptedCredentials);
    if (!credentials.webhookSecret) {
      // Not configured for this account — fail closed, same outcome as a
      // wrong signature (never a distinguishable error to the caller).
      return false;
    }
    const expected = this.hmacSha256Hex(rawBody, credentials.webhookSecret);
    return this.timingSafeEqualHex(expected, signature);
  }

  async fetchOrderPayments(
    encryptedCredentials: Buffer,
    providerOrderId: string,
  ): Promise<MerchantOrderPayment[]> {
    const client = this.buildClient(encryptedCredentials);
    let res: Awaited<ReturnType<typeof client.orders.fetchPayments>>;
    try {
      res = await client.orders.fetchPayments(providerOrderId);
    } catch (err: unknown) {
      throw this.translateSdkError('fetchOrderPayments', err);
    }
    const items = Array.isArray(res.items) ? res.items : [];
    return items.map((p) => ({
      providerPaymentId: p.id,
      providerOrderId: p.order_id,
      amountPaise: BigInt(p.amount),
      currency: p.currency,
      status: p.status,
      captured: p.captured === true,
      method: typeof p.method === 'string' ? p.method : undefined,
    }));
  }

  /** Adapter-level capability only (task scope item 7) — not called by any
   * refund business workflow in this stage; kept unused until P8-11. */
  async createRefund(
    encryptedCredentials: Buffer,
    params: CreateMerchantRefundParams,
  ): Promise<MerchantRefundResult> {
    const client = this.buildClient(encryptedCredentials);
    // Same guard as `RazorpayService.createRefund` — the Razorpay refund
    // SDK call takes `amount` as a plain `number`, no string escape hatch.
    if (params.amountPaise > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new PaymentProviderApiError(
        `Refund amount ${params.amountPaise.toString()} paise exceeds safe integer precision for the Razorpay SDK`,
        this.provider,
        undefined,
        undefined,
        false,
      );
    }
    let refund: { id: string; status: string };
    try {
      refund = await client.payments.refund(params.providerPaymentId, {
        amount: Number(params.amountPaise),
        notes: params.reason ? { reason: params.reason } : undefined,
      });
    } catch (err: unknown) {
      throw this.translateSdkError('createRefund', err);
    }
    return { providerRefundId: refund.id, status: refund.status };
  }

  /** Builds a brand-new SDK client from this call's own credentials only —
   * never stored on `this`, never reused by a later call. */
  private buildClient(encryptedCredentials: Buffer): Razorpay {
    const credentials = this.decryptCredentials(encryptedCredentials);
    return new Razorpay({
      key_id: credentials.keyId,
      key_secret: credentials.keySecret,
    });
  }

  /** The only place this class calls `CredentialEncryptionService.decrypt`.
   * Fails closed on any decrypt/parse/shape problem — never rethrows the
   * underlying crypto error (which can carry buffer contents), never
   * returns partial plaintext. */
  private decryptCredentials(
    encryptedCredentials: Buffer,
  ): RazorpayMerchantCredentials {
    let plaintext: string;
    try {
      plaintext = this.credentialEncryption.decrypt(encryptedCredentials);
    } catch {
      throw new PaymentProviderCredentialError(this.provider);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(plaintext);
    } catch {
      throw new PaymentProviderCredentialError(this.provider);
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { keyId?: unknown }).keyId !== 'string' ||
      typeof (parsed as { keySecret?: unknown }).keySecret !== 'string'
    ) {
      throw new PaymentProviderCredentialError(this.provider);
    }
    const webhookSecret = (parsed as { webhookSecret?: unknown }).webhookSecret;
    if (webhookSecret !== undefined && typeof webhookSecret !== 'string') {
      // Present but malformed — fail closed rather than silently treat it
      // as "not configured".
      throw new PaymentProviderCredentialError(this.provider);
    }
    return parsed as RazorpayMerchantCredentials;
  }

  private hmacSha256Hex(message: string, secret: string): string {
    return createHmac('sha256', secret).update(message).digest('hex');
  }

  /** Constant-time comparison — same discipline as
   * `RazorpayService.timingSafeEqualHex`. */
  private timingSafeEqualHex(expectedHex: string, actualHex: string): boolean {
    const expected = Buffer.from(expectedHex, 'utf8');
    const actual = Buffer.from(actualHex, 'utf8');
    if (expected.length !== actual.length) {
      return false;
    }
    return timingSafeEqual(expected, actual);
  }

  /**
   * Translates whatever the Razorpay SDK threw into a diagnosable,
   * credential-free error. Same two-shape detection as
   * `RazorpayService.translateSdkError` (real API error object vs. the
   * SDK's mangled response-less-transport-failure `TypeError`), but never
   * logs/includes amount, currency, receipt, or any credential material —
   * only the provider's own HTTP status/error code/description, which
   * Razorpay itself already treats as non-secret diagnostic text.
   */
  private translateSdkError(
    op: string,
    err: unknown,
  ): PaymentProviderApiError {
    if (
      typeof err === 'object' &&
      err !== null &&
      'statusCode' in err &&
      typeof (err as { statusCode?: unknown }).statusCode === 'number'
    ) {
      const e = err as {
        statusCode: number;
        error?: { code?: string; description?: string };
      };
      const desc = e.error?.description ?? 'no description';
      const code = e.error?.code;
      this.logger.error(
        `Razorpay ${op} rejected: HTTP ${e.statusCode}${
          code ? ` code=${code}` : ''
        } — ${desc}`,
      );
      return new PaymentProviderApiError(
        `Razorpay ${op} failed: HTTP ${e.statusCode}${
          code ? ` (${code})` : ''
        } — ${desc}`,
        this.provider,
        e.statusCode,
        code,
        false,
      );
    }

    const raw = err as
      | { code?: unknown; message?: unknown; name?: unknown }
      | undefined;
    const netCode = typeof raw?.code === 'string' ? raw.code : undefined;
    const mangled =
      raw?.name === 'TypeError' &&
      typeof raw.message === 'string' &&
      raw.message.includes("reading 'status'");
    const detail =
      netCode ??
      (mangled
        ? 'no response from Razorpay'
        : typeof raw?.message === 'string'
          ? raw.message
          : 'unknown transport error');
    this.logger.error(
      `Razorpay ${op} could not reach the API: ${detail}`,
      err instanceof Error ? err.stack : undefined,
    );
    return new PaymentProviderApiError(
      `Razorpay ${op} failed: could not reach Razorpay (${detail})`,
      this.provider,
      undefined,
      netCode,
      true,
    );
  }
}
