import { PaymentProviderType } from '@prisma/client';

/**
 * Phase 8 (P8-8) — the finalized commerce provider-integration surface,
 * extending the P8-6 marker interface with exactly the capabilities
 * P8-9 (payment creation/verification) and P8-11 (refunds) need. Every
 * method is parameterized by an opaque `encryptedCredentials: Buffer` —
 * the same `PaymentAccount.credentialsEncrypted` envelope
 * `PaymentAccountsService.getEncryptedCredentials` already returns — never
 * a decrypted credentials object. This is what keeps the interface
 * provider-neutral (P8-3 §5.3): a caller never sees or handles plaintext,
 * and a future non-Razorpay adapter can decode an entirely different
 * credential shape from the same opaque blob type.
 *
 * Deliberately excluded from this interface (task strict rules — no
 * webhook implementation in this stage): `verifyWebhookSignature`. The
 * architecture spec's original conceptual sketch (P8-3 §5.1) included it,
 * but per-account webhook routing/ownership is explicit, separate,
 * later-authorized work (P8-3 §9) — adding the method now with no
 * consumer and no routing to call it from would be exactly the
 * speculative addition the task instructs against. A later stage extends
 * this interface when webhook routing is actually authorized.
 *
 * No account-connection/onboarding methods live here either (P8-3 §5.1's
 * own carve-out, unchanged) — that remains `RazorpayAccountVerifierService`
 * / `PaymentAccountConnectionService`'s concern (P8-5).
 */
export interface CreateMerchantOrderParams {
  /** Bigint paise — never a float (see `RazorpayService`'s own precedent). */
  amountPaise: bigint;
  currency: string;
  receipt: string;
}

export interface MerchantOrderResult {
  providerOrderId: string;
}

export interface VerifyMerchantPaymentParams {
  providerOrderId: string;
  providerPaymentId: string;
  providerSignature: string;
}

/** One payment the provider has recorded against a provider order,
 * normalized to this codebase's conventions (bigint paise, never a
 * float). */
export interface MerchantOrderPayment {
  providerPaymentId: string;
  providerOrderId: string;
  amountPaise: bigint;
  currency: string;
  /** Provider-defined status string (e.g. Razorpay's 'created' |
   * 'authorized' | 'captured' | 'refunded' | 'failed') — passed through
   * uninterpreted; this stage does not implement verification/reconciliation
   * workflow logic that would need to branch on it. */
  status: string;
  captured: boolean;
  method?: string;
}

export interface CreateMerchantRefundParams {
  providerPaymentId: string;
  /** Bigint paise. */
  amountPaise: bigint;
  reason?: string;
}

export interface MerchantRefundResult {
  providerRefundId: string;
  status: string;
}

export interface PaymentProviderAdapter {
  readonly provider: PaymentProviderType;

  /**
   * The account's public key id — safe to hand to the frontend's
   * Checkout.js widget (mirrors `RazorpayService.getKeyId()`'s identical
   * "public, not a secret" precedent). Phase 8 (P8-9) needs this because
   * `InitiatePaymentView.razorpayKeyId` must now reflect the actual bound
   * merchant account's own key, not a single global one — synchronous,
   * same decrypt-only-inside-the-adapter boundary as
   * `verifyPaymentSignature`, never returns/logs the key secret.
   */
  getPublicKeyId(encryptedCredentials: Buffer): string;

  /** Create a merchant order against the provider account identified by
   * `encryptedCredentials`. Wired into `PaymentsService.initiatePayment`
   * by P8-9. */
  createOrder(
    encryptedCredentials: Buffer,
    params: CreateMerchantOrderParams,
  ): Promise<MerchantOrderResult>;

  /** Verify a customer-submitted payment signature against the merchant
   * account's own key secret. Synchronous — signature verification is
   * local HMAC computation, no provider API call. Wired into
   * `PaymentsService.verifyPayment` by P8-9. */
  verifyPaymentSignature(
    encryptedCredentials: Buffer,
    params: VerifyMerchantPaymentParams,
  ): boolean;

  /**
   * Verify a Razorpay webhook delivery's signature against the merchant
   * account's own webhook secret (a distinct secret from `keySecret`,
   * stored inside the same opaque credential envelope). Deliberately
   * NOT part of P8-8's frozen set — that stage's own doc comment named
   * this exact method as the one deferred until webhook routing was
   * authorized (P8-3 §9); P8-10 is that stage. Synchronous, same local-
   * HMAC/no-API-call shape as `verifyPaymentSignature`. Returns `false`
   * (never throws) when the account has no `webhookSecret` configured —
   * fail closed, the caller must reject exactly like a bad signature,
   * never a 500.
   */
  verifyWebhookSignature(
    encryptedCredentials: Buffer,
    rawBody: string,
    signature: string,
  ): boolean;

  /** Fetch every payment the provider has recorded against one of the
   * merchant's own provider orders. Adapter-level capability only — not
   * called by any P8-9 code path (verification is signature-based, not
   * fetch-based); kept available for a future reconciliation stage. */
  fetchOrderPayments(
    encryptedCredentials: Buffer,
    providerOrderId: string,
  ): Promise<MerchantOrderPayment[]>;

  /** Adapter-level refund capability only (task scope item 7) — no refund
   * business workflow calls this yet; kept unused until P8-11. */
  createRefund(
    encryptedCredentials: Buffer,
    params: CreateMerchantRefundParams,
  ): Promise<MerchantRefundResult>;
}
