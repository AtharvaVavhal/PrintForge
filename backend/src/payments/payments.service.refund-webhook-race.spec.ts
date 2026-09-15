import { RefundStatus } from '@prisma/client';
import { PaymentMismatchError } from './payment-mismatch.error';
import {
  PaymentsService,
  UnresolvedRefundWebhookError,
} from './payments.service';

/**
 * P8-13 — deterministic regression for
 * docs/saas/PHASE-8-SECURITY-AUDIT.md §9/§18 P1 #2: a `refund.processed`/
 * `refund.failed` webhook delivered before `RefundsService.
 * callProviderAndSettle` finishes stamping `razorpayRefundId` onto the
 * local `Refund` row must be RETRIED, never permanently `IGNORED`.
 *
 * This file simulates the two-request race directly against
 * `PaymentsService.applyMerchantWebhookEvent` (the method
 * `WebhookProcessor`'s poller actually calls) using a single, SHARED,
 * mutable fake `tx` — call #1 models the webhook arriving first (no
 * local row exists yet); the row is then mutated in place to model
 * `RefundsService`'s own local write catching up; call #2 models
 * `WebhookProcessor`'s existing bounded-backoff retry finding the
 * now-present row. No DB, no HTTP, no real Razorpay SDK call anywhere.
 */
describe('PaymentsService — refund webhook / provider-call race (P8-13, P1 #2)', () => {
  const REFUND_PROCESSED_PAYLOAD = {
    event: 'refund.processed',
    payload: {
      refund: {
        entity: {
          id: 'rfnd_race_1',
          payment_id: 'pay_1',
          amount: 5000,
          status: 'processed',
        },
      },
    },
  };
  const REFUND_FAILED_PAYLOAD = {
    event: 'refund.failed',
    payload: {
      refund: {
        entity: {
          id: 'rfnd_race_1',
          payment_id: 'pay_1',
          amount: 5000,
          status: 'failed',
          error_description: 'insufficient balance',
        },
      },
    },
  };

  function makeRazorpay() {
    return {
      verifyWebhookSignature: jest.fn(),
      verifySignature: jest.fn(),
    };
  }

  function makeResolution() {
    return {
      resolveForStore: jest.fn(),
      resolveForBoundAccount: jest.fn(),
      resolveForWebhook: jest.fn(),
    };
  }

  function makePaymentAccounts() {
    return { getEncryptedCredentials: jest.fn() };
  }

  function makeService() {
    return new PaymentsService(
      {} as never,
      makeRazorpay() as never,
      makeResolution() as never,
      makePaymentAccounts() as never,
    );
  }

  /** A `tx` double whose `refund` table is a plain, mutable in-memory
   * store the test can insert into BETWEEN two calls — modelling exactly
   * what happens in a real Postgres transaction across two separate,
   * time-separated `WebhookProcessor.processOne` invocations for the
   * same `WebhookEvent` row (first attempt, then a later retry). */
  function makeTx() {
    const rows = new Map<string, Record<string, unknown>>();
    return {
      refund: {
        findUnique: jest
          .fn()
          .mockImplementation(
            ({ where }: { where: { razorpayRefundId: string } }) => {
              for (const row of rows.values()) {
                if (row.razorpayRefundId === where.razorpayRefundId) {
                  return Promise.resolve(row);
                }
              }
              return Promise.resolve(null);
            },
          ),
        updateMany: jest
          .fn()
          .mockImplementation(
            ({
              where,
              data,
            }: {
              where: { id: string; status: RefundStatus };
              data: Record<string, unknown>;
            }) => {
              const row = rows.get(where.id);
              if (!row || row.status !== where.status) {
                return Promise.resolve({ count: 0 });
              }
              Object.assign(row, data);
              return Promise.resolve({ count: 1 });
            },
          ),
      },
      // Test-only helper — not part of the real Prisma.TransactionClient
      // surface, used only to simulate RefundsService's own later write.
      _insertRefund(row: Record<string, unknown>) {
        rows.set(row.id as string, row);
      },
      _get(id: string) {
        return rows.get(id);
      },
    };
  }

  it('THE RACE: webhook arrives before the local razorpayRefundId write — throws (retryable), never silently IGNORED', async () => {
    const tx = makeTx();
    const service = makeService();

    // No local Refund row exists yet for 'rfnd_race_1' — RefundsService's
    // own createRefund()/callProviderAndSettle() has not finished its
    // local write when this (simulated) webhook delivery arrives.
    await expect(
      service.applyMerchantWebhookEvent(
        tx as never,
        'pa-1',
        REFUND_PROCESSED_PAYLOAD,
      ),
    ).rejects.toBeInstanceOf(UnresolvedRefundWebhookError);

    // Nothing was created, nothing was silently marked processed.
    expect(tx._get('refund-1')).toBeUndefined();
  });

  it("THE RETRY RESOLVES IT: once the local write lands, the SAME event (WebhookProcessor's existing backoff retry) succeeds and settles the refund — it can never remain permanently PENDING solely because the webhook won the race", async () => {
    const tx = makeTx();
    const service = makeService();

    // Attempt 1 (webhook wins the race) — throws, as proven above.
    await expect(
      service.applyMerchantWebhookEvent(
        tx as never,
        'pa-1',
        REFUND_PROCESSED_PAYLOAD,
      ),
    ).rejects.toBeInstanceOf(UnresolvedRefundWebhookError);

    // Between attempt 1 and WebhookProcessor's next scheduled retry (>=30s
    // later in production), RefundsService.callProviderAndSettle's own
    // write completes — modelled here as a direct insert into the SAME
    // shared tx state.
    tx._insertRefund({
      id: 'refund-1',
      razorpayRefundId: 'rfnd_race_1',
      amountPaise: 5000n,
      status: RefundStatus.PENDING,
      paymentAccountId: 'pa-1',
      failureReason: null,
    });

    // Attempt 2 (the retry) — now finds the row and settles it correctly.
    const outcome = await service.applyMerchantWebhookEvent(
      tx as never,
      'pa-1',
      REFUND_PROCESSED_PAYLOAD,
    );

    expect(outcome).toBe('PROCESSED');
    expect(tx._get('refund-1')?.status).toBe(RefundStatus.PROCESSED);
  });

  it('the same race for a refund.failed delivery also resolves correctly on retry', async () => {
    const tx = makeTx();
    const service = makeService();

    await expect(
      service.applyMerchantWebhookEvent(
        tx as never,
        'pa-1',
        REFUND_FAILED_PAYLOAD,
      ),
    ).rejects.toBeInstanceOf(UnresolvedRefundWebhookError);

    tx._insertRefund({
      id: 'refund-1',
      razorpayRefundId: 'rfnd_race_1',
      amountPaise: 5000n,
      status: RefundStatus.PENDING,
      paymentAccountId: 'pa-1',
      failureReason: null,
    });

    const outcome = await service.applyMerchantWebhookEvent(
      tx as never,
      'pa-1',
      REFUND_FAILED_PAYLOAD,
    );

    expect(outcome).toBe('PROCESSED'); // acknowledged
    expect(tx._get('refund-1')?.status).toBe(RefundStatus.FAILED);
    expect(tx._get('refund-1')?.failureReason).toBe('insufficient balance');
  });

  it('duplicate delivery AFTER the race has already resolved is a safe no-op (idempotency preserved)', async () => {
    const tx = makeTx();
    const service = makeService();
    tx._insertRefund({
      id: 'refund-1',
      razorpayRefundId: 'rfnd_race_1',
      amountPaise: 5000n,
      status: RefundStatus.PENDING,
      paymentAccountId: 'pa-1',
      failureReason: null,
    });

    const first = await service.applyMerchantWebhookEvent(
      tx as never,
      'pa-1',
      REFUND_PROCESSED_PAYLOAD,
    );
    const second = await service.applyMerchantWebhookEvent(
      tx as never,
      'pa-1',
      REFUND_PROCESSED_PAYLOAD,
    );

    expect(first).toBe('PROCESSED');
    expect(second).toBe('PROCESSED'); // acknowledged, not re-applied
    expect(tx.refund.updateMany).toHaveBeenCalledTimes(2); // both CAS calls ran; the second matched 0 rows (already PROCESSED) and changed nothing
  });

  it('out-of-order delivery (failed arriving after processed) never regresses an already-PROCESSED refund', async () => {
    const tx = makeTx();
    const service = makeService();
    tx._insertRefund({
      id: 'refund-1',
      razorpayRefundId: 'rfnd_race_1',
      amountPaise: 5000n,
      status: RefundStatus.PENDING,
      paymentAccountId: 'pa-1',
      failureReason: null,
    });

    await service.applyMerchantWebhookEvent(
      tx as never,
      'pa-1',
      REFUND_PROCESSED_PAYLOAD,
    );
    await service.applyMerchantWebhookEvent(
      tx as never,
      'pa-1',
      REFUND_FAILED_PAYLOAD,
    );

    expect(tx._get('refund-1')?.status).toBe(RefundStatus.PROCESSED); // never downgraded to FAILED
  });

  it('account-mismatch rejection is preserved across the race/retry sequence — a retry never bypasses isolation', async () => {
    const tx = makeTx();
    const service = makeService();
    tx._insertRefund({
      id: 'refund-1',
      razorpayRefundId: 'rfnd_race_1',
      amountPaise: 5000n,
      status: RefundStatus.PENDING,
      paymentAccountId: 'pa-OTHER',
      failureReason: null,
    });

    const outcome = await service.applyMerchantWebhookEvent(
      tx as never,
      'pa-1',
      REFUND_PROCESSED_PAYLOAD,
    );

    expect(outcome).toBe('IGNORED'); // still terminal — this is NOT a race, the row exists and simply isn't ours
    expect(tx._get('refund-1')?.status).toBe(RefundStatus.PENDING); // untouched
  });

  it('amount-mismatch (PaymentMismatchError) is preserved once the race resolves — never silently settles on bad evidence', async () => {
    const tx = makeTx();
    const service = makeService();
    tx._insertRefund({
      id: 'refund-1',
      razorpayRefundId: 'rfnd_race_1',
      amountPaise: 9999n, // does not match the payload's 5000
      status: RefundStatus.PENDING,
      paymentAccountId: 'pa-1',
      failureReason: null,
    });

    await expect(
      service.applyMerchantWebhookEvent(
        tx as never,
        'pa-1',
        REFUND_PROCESSED_PAYLOAD,
      ),
    ).rejects.toBeInstanceOf(PaymentMismatchError);
    expect(tx._get('refund-1')?.status).toBe(RefundStatus.PENDING); // never settled on unverified evidence
  });

  it('the adapter/provider is never consulted while resolving this race — webhook completion is local DB state only', async () => {
    const tx = makeTx();
    const resolution = makeResolution();
    const service = new PaymentsService(
      {} as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccounts() as never,
    );

    await service
      .applyMerchantWebhookEvent(tx as never, 'pa-1', REFUND_PROCESSED_PAYLOAD)
      .catch(() => undefined);

    expect(resolution.resolveForBoundAccount).not.toHaveBeenCalled();
    expect(resolution.resolveForStore).not.toHaveBeenCalled();
  });
});
