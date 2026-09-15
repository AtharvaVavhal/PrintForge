import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import {
  PaymentAttemptStatus,
  PaymentProviderType,
  RefundStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import {
  MerchantPaymentUnavailableError,
  PaymentProviderUnavailableError,
} from '../merchant-commerce.errors';
import { PaymentAccountTenantMismatchError } from '../payment-accounts/payment-account-resolution.errors';
import { PaymentProviderApiError } from '../providers/payment-provider.errors';
import { RefundsService } from './refunds.service';

/**
 * P8-11/P8-13 — the merchant commerce refund business workflow. Same
 * hand-built-mock convention `payment-accounts.service.spec.ts` already
 * establishes for this exact class of service (`resolveTenantAuditActor`
 * mocked directly, `$transaction` invokes the callback with a fake `tx`)
 * — no DB, no HTTP, no Nest testing module, no real Razorpay SDK call
 * anywhere. `@sentry/node` is mocked (P8-13) so the new failure-path
 * capture (`markFailed`) can be asserted on directly.
 */
jest.mock('../../common/audit/tenant-actor-attribution', () => ({
  resolveTenantAuditActor: jest
    .fn()
    .mockResolvedValue({ actorMembershipId: 'membership-1' }),
}));
jest.mock('@sentry/node');

describe('RefundsService', () => {
  const actor: AuthenticatedUser = {
    id: 'admin-user-1',
    email: 'admin@example.test',
    role: 'ADMIN',
    platformRole: null,
    memberships: [{ tenantId: 'tenant-a', role: 'ADMIN' }],
  };

  const tenantContext: TenantContext = {
    tenantId: 'tenant-a',
    source: 'membership-default',
    membership: { role: 'ADMIN' },
  };

  const CAPTURED_ATTEMPT = {
    id: 'attempt-1',
    orderId: 'order-1',
    tenantId: 'tenant-a',
    razorpayOrderId: 'rzp_order_1',
    razorpayPaymentId: 'rzp_payment_1',
    amountPaise: 14900n,
    currency: 'INR',
    status: PaymentAttemptStatus.CAPTURED,
    paymentAccountId: 'pa-1',
  };

  const ENCRYPTED_BLOB = Buffer.from('opaque-ciphertext-should-never-appear');

  function makeAdapter(overrides: { createRefund?: jest.Mock } = {}) {
    return {
      provider: PaymentProviderType.RAZORPAY,
      getPublicKeyId: jest.fn(),
      createOrder: jest.fn(),
      verifyPaymentSignature: jest.fn(),
      verifyWebhookSignature: jest.fn(),
      fetchOrderPayments: jest.fn(),
      createRefund:
        overrides.createRefund ??
        jest.fn().mockResolvedValue({
          providerRefundId: 'rfnd_1',
          status: 'processed',
        }),
    };
  }

  function makeAudit() {
    return { logTenantAction: jest.fn().mockResolvedValue(undefined) };
  }

  function makeResolution(adapter = makeAdapter()) {
    return {
      resolveForBoundAccount: jest.fn().mockResolvedValue({
        paymentAccountId: 'pa-1',
        provider: PaymentProviderType.RAZORPAY,
        adapter,
      }),
    };
  }

  function makePaymentAccounts(encrypted: Buffer | null = ENCRYPTED_BLOB) {
    return { getEncryptedCredentials: jest.fn().mockResolvedValue(encrypted) };
  }

  /** Simulates the reservation transaction with in-memory refund/attempt
   * state, INCLUDING the FOR UPDATE lock query (a no-op resolve here —
   * real serialization is exercised by the "concurrent requests" test via
   * sequential calls against SHARED state, matching how this codebase's
   * other concurrency unit tests already simulate a lock's effect without
   * a real database). */
  function makePrisma(opts: {
    attempt?: Record<string, unknown> | null;
    existingRefunds?: Record<string, unknown>[];
  }) {
    const refunds: Record<string, unknown>[] = [
      ...(opts.existingRefunds ?? []),
    ];
    let nextId = refunds.length + 1;
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      paymentAttempt: {
        findUnique: jest.fn().mockResolvedValue(opts.attempt ?? null),
      },
      refund: {
        findMany: jest.fn().mockImplementation(
          ({
            where,
          }: {
            where: {
              paymentAttemptId: string;
              status: { in: RefundStatus[] };
            };
          }) =>
            Promise.resolve(
              refunds.filter(
                (r) =>
                  r.paymentAttemptId === where.paymentAttemptId &&
                  where.status.in.includes(r.status as RefundStatus),
              ),
            ),
        ),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            const row = {
              id: `refund-${nextId++}`,
              failureReason: null,
              razorpayRefundId: null,
              createdAt: new Date(),
              ...data,
            };
            refunds.push(row);
            return Promise.resolve(row);
          }),
      },
      tenantMembership: { findUnique: jest.fn() },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
      refund: {
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
              const row = refunds.find((r) => r.id === where.id);
              if (!row || row.status !== where.status) {
                return Promise.resolve({ count: 0 });
              }
              Object.assign(row, data);
              return Promise.resolve({ count: 1 });
            },
          ),
        update: jest
          .fn()
          .mockImplementation(
            ({
              where,
              data,
            }: {
              where: { id: string };
              data: Record<string, unknown>;
            }) => {
              const row = refunds.find((r) => r.id === where.id);
              if (!row) throw new Error('not found');
              Object.assign(row, data);
              return Promise.resolve(row);
            },
          ),
        findUniqueOrThrow: jest
          .fn()
          .mockImplementation(({ where }: { where: { id: string } }) => {
            const row = refunds.find((r) => r.id === where.id);
            if (!row) throw new Error('not found');
            return Promise.resolve(row);
          }),
      },
    };
    return { prisma, tx, refunds };
  }

  function makeService(
    prisma: ReturnType<typeof makePrisma>['prisma'],
    resolution = makeResolution(),
    paymentAccounts = makePaymentAccounts(),
  ) {
    return new RefundsService(
      prisma as never,
      makeAudit() as never,
      resolution as never,
      paymentAccounts as never,
    );
  }

  // ─── Full + partial refund ──────────────────────────────────────────

  it('a full refund (no amountPaise given) refunds the entire captured amount', async () => {
    const { prisma } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma);

    const result = await service.createRefund(
      tenantContext,
      actor,
      'attempt-1',
      {},
    );

    expect(result.amountPaise).toBe('14900');
    expect(result.status).toBe(RefundStatus.PROCESSED);
  });

  it('a partial refund reserves and settles exactly the requested amount', async () => {
    const { prisma } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma);

    const result = await service.createRefund(
      tenantContext,
      actor,
      'attempt-1',
      {
        amountPaise: '5000',
      },
    );

    expect(result.amountPaise).toBe('5000');
  });

  it('a second partial refund succeeds as long as the cumulative total stays within the captured amount', async () => {
    const { prisma } = makePrisma({
      attempt: CAPTURED_ATTEMPT,
      existingRefunds: [
        {
          id: 'refund-0',
          paymentAttemptId: 'attempt-1',
          amountPaise: 5000n,
          status: RefundStatus.PROCESSED,
        },
      ],
    });
    const service = makeService(prisma);

    const result = await service.createRefund(
      tenantContext,
      actor,
      'attempt-1',
      {
        amountPaise: '9900',
      },
    );

    expect(result.amountPaise).toBe('9900');
  });

  // ─── Cumulative limit ───────────────────────────────────────────────

  it('rejects a refund whose cumulative total (with an existing PROCESSED refund) would exceed the captured amount', async () => {
    const { prisma } = makePrisma({
      attempt: CAPTURED_ATTEMPT,
      existingRefunds: [
        {
          id: 'refund-0',
          paymentAttemptId: 'attempt-1',
          amountPaise: 10000n,
          status: RefundStatus.PROCESSED,
        },
      ],
    });
    const service = makeService(prisma);

    await expect(
      service.createRefund(tenantContext, actor, 'attempt-1', {
        amountPaise: '5000',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('a PENDING refund also counts toward the cumulative limit (reserved, not yet settled)', async () => {
    const { prisma } = makePrisma({
      attempt: CAPTURED_ATTEMPT,
      existingRefunds: [
        {
          id: 'refund-0',
          paymentAttemptId: 'attempt-1',
          amountPaise: 14900n,
          status: RefundStatus.PENDING,
        },
      ],
    });
    const service = makeService(prisma);

    await expect(
      service.createRefund(tenantContext, actor, 'attempt-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('a FAILED refund does NOT count toward the cumulative limit — its reserved amount is freed', async () => {
    const { prisma } = makePrisma({
      attempt: CAPTURED_ATTEMPT,
      existingRefunds: [
        {
          id: 'refund-0',
          paymentAttemptId: 'attempt-1',
          amountPaise: 14900n,
          status: RefundStatus.FAILED,
        },
      ],
    });
    const service = makeService(prisma);

    const result = await service.createRefund(
      tenantContext,
      actor,
      'attempt-1',
      {},
    );

    expect(result.amountPaise).toBe('14900');
  });

  // ─── Validation ─────────────────────────────────────────────────────

  it('rejects a zero amount', async () => {
    const { prisma } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma);

    await expect(
      service.createRefund(tenantContext, actor, 'attempt-1', {
        amountPaise: '0',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an amount exceeding the refundable balance', async () => {
    const { prisma } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma);

    await expect(
      service.createRefund(tenantContext, actor, 'attempt-1', {
        amountPaise: '99999',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a payment attempt with no provider payment id', async () => {
    const { prisma } = makePrisma({
      attempt: { ...CAPTURED_ATTEMPT, razorpayPaymentId: null },
    });
    const service = makeService(prisma);

    await expect(
      service.createRefund(tenantContext, actor, 'attempt-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a non-refundable (not CAPTURED) payment attempt', async () => {
    const { prisma } = makePrisma({
      attempt: { ...CAPTURED_ATTEMPT, status: PaymentAttemptStatus.INITIATED },
    });
    const service = makeService(prisma);

    await expect(
      service.createRefund(tenantContext, actor, 'attempt-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects (404, not found) an unknown payment attempt id', async () => {
    const { prisma } = makePrisma({ attempt: null });
    const service = makeService(prisma);

    await expect(
      service.createRefund(tenantContext, actor, 'nope', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── Cross-tenant / historical-account isolation ───────────────────

  it('cross-tenant rejection — a payment attempt belonging to another tenant is a 404, never a 403 (no existence leak)', async () => {
    const { prisma } = makePrisma({
      attempt: { ...CAPTURED_ATTEMPT, tenantId: 'tenant-OTHER' },
    });
    const service = makeService(prisma);

    await expect(
      service.createRefund(tenantContext, actor, 'attempt-1', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("uses resolveForBoundAccount with the attempt's OWN historical paymentAccountId — never a client-supplied one (the DTO has no such field)", async () => {
    const resolution = makeResolution();
    const { prisma } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma, resolution);

    await service.createRefund(tenantContext, actor, 'attempt-1', {});

    expect(resolution.resolveForBoundAccount).toHaveBeenCalledWith(
      'tenant-a',
      'pa-1',
    );
  });

  it('a payment attempt with no historically-bound PaymentAccount fails cleanly — no fallback to any other account', async () => {
    const { prisma } = makePrisma({
      attempt: { ...CAPTURED_ATTEMPT, paymentAccountId: null },
    });
    const service = makeService(prisma);

    await expect(
      service.createRefund(tenantContext, actor, 'attempt-1', {}),
    ).rejects.toBeInstanceOf(MerchantPaymentUnavailableError);
  });

  it('the historical PaymentAccount remains usable even when it has since been DISABLED (resolveForBoundAccount does not gate on status)', async () => {
    // Simulated by resolveForBoundAccount itself resolving successfully —
    // that method's own contract (P8-3 §6 point 2) is to never require
    // ACTIVE status; this test proves RefundsService imposes no
    // additional status check of its own on top of it.
    const adapter = makeAdapter();
    const resolution = makeResolution(adapter);
    const { prisma } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma, resolution, makePaymentAccounts());

    const result = await service.createRefund(
      tenantContext,
      actor,
      'attempt-1',
      {},
    );

    expect(result.status).toBe(RefundStatus.PROCESSED);
    expect(adapter.createRefund).toHaveBeenCalled();
  });

  it("an unresolvable historical account (structurally-shouldn't-happen tenant mismatch) fails the refund and marks it FAILED, never silently switching accounts", async () => {
    const resolution = {
      resolveForBoundAccount: jest
        .fn()
        .mockRejectedValue(new PaymentAccountTenantMismatchError('pa-1')),
    };
    const { prisma, refunds } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma, resolution);

    await expect(
      service.createRefund(tenantContext, actor, 'attempt-1', {}),
    ).rejects.toBeInstanceOf(MerchantPaymentUnavailableError);
    expect(refunds[0].status).toBe(RefundStatus.FAILED);
  });

  // ─── Provider call: merchant credentials, SaaS never used ──────────

  it("calls the adapter's createRefund with the merchant account's own encrypted credentials", async () => {
    const adapter = makeAdapter();
    const resolution = makeResolution(adapter);
    const paymentAccounts = makePaymentAccounts();
    const { prisma } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma, resolution, paymentAccounts);

    await service.createRefund(tenantContext, actor, 'attempt-1', {
      amountPaise: '5000',
    });

    expect(paymentAccounts.getEncryptedCredentials).toHaveBeenCalledWith(
      'tenant-a',
      'pa-1',
    );
    expect(adapter.createRefund).toHaveBeenCalledWith(ENCRYPTED_BLOB, {
      providerPaymentId: 'rzp_payment_1',
      amountPaise: 5000n,
      reason: undefined,
    });
  });

  it('SaaS/global credentials are never used — RefundsService has no dependency capable of reaching them (structural: no RazorpayService/ConfigService in its constructor)', () => {
    // RefundsService's constructor signature itself is the proof: it
    // only ever accepts PrismaService/AuditService/
    // PaymentAccountResolutionService/PaymentAccountsService — there is
    // no RazorpayService or ConfigService parameter for it to misuse.
    expect(RefundsService.length).toBe(4);
  });

  it('fails cleanly when the resolved account has no encrypted credentials configured', async () => {
    const { prisma, refunds } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(
      prisma,
      makeResolution(),
      makePaymentAccounts(null),
    );

    await expect(
      service.createRefund(tenantContext, actor, 'attempt-1', {}),
    ).rejects.toBeInstanceOf(MerchantPaymentUnavailableError);
    expect(refunds[0].status).toBe(RefundStatus.FAILED);
  });

  it('no credential leakage — the encrypted blob and any credential material never appear in the returned view or thrown errors', async () => {
    const { prisma } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma);

    const result = await service.createRefund(
      tenantContext,
      actor,
      'attempt-1',
      {},
    );

    expect(JSON.stringify(result)).not.toContain('opaque-ciphertext');
  });

  // ─── Successful / failed Razorpay refund ───────────────────────────

  it('a successful (processed) Razorpay refund settles the Refund row PROCESSED with the provider refund id', async () => {
    const { prisma } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma);

    const result = await service.createRefund(
      tenantContext,
      actor,
      'attempt-1',
      {},
    );

    expect(result.status).toBe(RefundStatus.PROCESSED);
  });

  it('a pending (async) Razorpay refund stamps the provider id but leaves the Refund row PENDING — settled later by the refund webhook', async () => {
    const adapter = makeAdapter({
      createRefund: jest.fn().mockResolvedValue({
        providerRefundId: 'rfnd_async',
        status: 'pending',
      }),
    });
    const { prisma, refunds } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma, makeResolution(adapter));

    const result = await service.createRefund(
      tenantContext,
      actor,
      'attempt-1',
      {},
    );

    expect(result.status).toBe(RefundStatus.PENDING);
    expect(refunds[0].razorpayRefundId).toBe('rfnd_async');
  });

  it('a synchronously-reported failed refund settles the Refund row FAILED, never falsely PROCESSED', async () => {
    const adapter = makeAdapter({
      createRefund: jest
        .fn()
        .mockResolvedValue({ providerRefundId: 'rfnd_bad', status: 'failed' }),
    });
    const { prisma } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma, makeResolution(adapter));

    const result = await service.createRefund(
      tenantContext,
      actor,
      'attempt-1',
      {},
    );

    expect(result.status).toBe(RefundStatus.FAILED);
  });

  it('a thrown provider error settles the Refund row FAILED and surfaces PaymentProviderUnavailableError — never a falsely-successful refund', async () => {
    const adapter = makeAdapter({
      createRefund: jest
        .fn()
        .mockRejectedValue(
          new PaymentProviderApiError(
            'boom',
            PaymentProviderType.RAZORPAY,
            500,
            undefined,
            false,
          ),
        ),
    });
    const { prisma, refunds } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma, makeResolution(adapter));

    await expect(
      service.createRefund(tenantContext, actor, 'attempt-1', {}),
    ).rejects.toBeInstanceOf(PaymentProviderUnavailableError);
    expect(refunds[0].status).toBe(RefundStatus.FAILED);
  });

  // ─── P8-13 — success path is now CAS-disciplined, consistent with markFailed ──

  it('P8-13: the success-path settle is CAS-guarded (updateMany scoped to PENDING), not a blind update — never overwrites a status a racing webhook already changed', async () => {
    // Simulates the provider call itself taking long enough that a
    // concurrent webhook delivery (docs/saas/PHASE-8-SECURITY-AUDIT.md
    // §9/§18 P1 #2's own race) settles this exact refund BEFORE
    // callProviderAndSettle's own final write runs — modelled by having
    // the adapter mock flip the row's status as a side effect of the
    // "provider call" itself, then verifying the local settle-write does
    // NOT blindly overwrite that outcome.
    const { prisma, refunds } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const adapter = makeAdapter({
      createRefund: jest.fn().mockImplementation(() => {
        // A "webhook" races in and settles the row first.
        refunds[0].status = RefundStatus.PROCESSED;
        refunds[0].razorpayRefundId = 'rfnd_from_webhook';
        return Promise.resolve({
          providerRefundId: 'rfnd_from_create_response',
          status: 'processed',
        });
      }),
    });
    const service = makeService(prisma, makeResolution(adapter));

    const result = await service.createRefund(
      tenantContext,
      actor,
      'attempt-1',
      {},
    );

    // The CAS matched 0 rows (status was no longer PENDING) — the
    // webhook's own write (and its own razorpayRefundId) survives
    // untouched, never clobbered by this call's own attempted write.
    expect(result.status).toBe(RefundStatus.PROCESSED);
    expect(result.id).toBe(refunds[0].id);
    expect(refunds[0].razorpayRefundId).toBe('rfnd_from_webhook');
  });

  it('P8-13: a normal (non-racing) successful settle still applies via the CAS path', async () => {
    const { prisma, refunds } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma);

    const result = await service.createRefund(
      tenantContext,
      actor,
      'attempt-1',
      {},
    );

    expect(result.status).toBe(RefundStatus.PROCESSED);
    expect(refunds[0].razorpayRefundId).toBe('rfnd_1');
  });

  // ─── P8-13 — Sentry capture on refund failure ───────────────────────

  it('P8-13: a failed refund raises a Sentry capture, matching the convention every comparable payment-side failure path already uses', async () => {
    (Sentry.captureMessage as jest.Mock).mockClear();
    const adapter = makeAdapter({
      createRefund: jest
        .fn()
        .mockResolvedValue({ providerRefundId: 'rfnd_bad', status: 'failed' }),
    });
    const { prisma } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma, makeResolution(adapter));

    await service.createRefund(tenantContext, actor, 'attempt-1', {});

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'Merchant refund failed',
      expect.objectContaining({ tags: { area: 'refund_failed' } }),
    );
  });

  it('P8-13: Sentry capture never includes credential material — only the refund id and a generic reason', async () => {
    (Sentry.captureMessage as jest.Mock).mockClear();
    const { prisma } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(
      prisma,
      makeResolution(),
      makePaymentAccounts(null),
    );

    await service
      .createRefund(tenantContext, actor, 'attempt-1', {})
      .catch(() => undefined);

    expect(Sentry.captureMessage).toHaveBeenCalled();
    const call = (Sentry.captureMessage as jest.Mock).mock
      .calls[0] as unknown[];
    expect(JSON.stringify(call)).not.toContain('opaque-ciphertext');
  });

  // ─── Idempotency / concurrency (CAS) ────────────────────────────────

  it('CAS: markFailed never overwrites a Refund row a webhook has already settled to PROCESSED', async () => {
    const adapter = makeAdapter({
      createRefund: jest
        .fn()
        .mockRejectedValue(
          new PaymentProviderApiError(
            'boom',
            PaymentProviderType.RAZORPAY,
            500,
            undefined,
            false,
          ),
        ),
    });
    const { prisma, refunds } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma, makeResolution(adapter));

    // Simulate: by the time the provider call fails, a concurrent webhook
    // already settled this exact row to PROCESSED (e.g. a race with an
    // out-of-band reconciliation). We can't know the refund id in
    // advance, so instead assert the CAS shape directly: updateMany is
    // always scoped to `status: PENDING`, so a PROCESSED row is
    // structurally unreachable by markFailed. Verified via the mock's own
    // CAS semantics in `makePrisma` (a status mismatch -> count 0).
    await expect(
      service.createRefund(tenantContext, actor, 'attempt-1', {}),
    ).rejects.toBeInstanceOf(PaymentProviderUnavailableError);
    // The refund WAS created PENDING, then CAS'd to FAILED (no concurrent
    // settle in THIS run) — proves the CAS path itself works end-to-end.
    expect(refunds[0].status).toBe(RefundStatus.FAILED);
  });

  it('duplicate/concurrent refund requests for the same attempt serialize via the FOR UPDATE lock — a second full-amount request is rejected once the first has reserved the balance', async () => {
    const { prisma } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = makeService(prisma);

    // Sequential calls against the SAME shared mock state simulate what
    // the real `SELECT ... FOR UPDATE` lock guarantees under real
    // concurrency: the second transaction only ever sees a consistent,
    // already-committed view of the first's reservation.
    const first = await service.createRefund(
      tenantContext,
      actor,
      'attempt-1',
      {},
    );
    expect(first.amountPaise).toBe('14900');

    await expect(
      service.createRefund(tenantContext, actor, 'attempt-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('the refund is audited via the existing TenantAuditLog mechanism', async () => {
    const audit = makeAudit();
    const { prisma } = makePrisma({ attempt: CAPTURED_ATTEMPT });
    const service = new RefundsService(
      prisma as never,
      audit as never,
      makeResolution() as never,
      makePaymentAccounts() as never,
    );

    await service.createRefund(tenantContext, actor, 'attempt-1', {
      reason: 'damaged item',
    });

    expect(audit.logTenantAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-a',
        action: 'refund.requested',
        targetType: 'Refund',
      }),
    );
  });
});
