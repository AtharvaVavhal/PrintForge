import { Prisma } from '@prisma/client';
import { OrderStatus, PaymentAccountStatus, PaymentProviderType } from '@prisma/client';
import {
  InactivePaymentAccountError,
  NoActivePaymentAccountError,
  PaymentAccountTenantMismatchError,
  StoreNotFoundError,
} from './payment-accounts/payment-account-resolution.errors';
import { MerchantPaymentUnavailableError, PaymentProviderUnavailableError } from './merchant-commerce.errors';
import { PaymentProviderApiError } from './providers/payment-provider.errors';
import { PaymentsService } from './payments.service';

/**
 * P8-9 — `PaymentsService.initiatePayment`'s merchant-commerce wiring:
 * bound-PaymentAccount resolution/requirement, `RazorpayProviderAdapter`
 * usage, and the CAS/idempotency behavior around both `paymentAccountId`
 * and `razorpayOrderId`.
 *
 * This REPLACES P8-7's own version of this file. P8-7 shipped a
 * deliberately best-effort binding step ("an unresolvable PaymentAccount
 * must never block payment initiation" — see the superseded assertions
 * that used to live here) that fell through to the pre-existing global-
 * credential `RazorpayService` regardless of whether a PaymentAccount was
 * bound. P8-9 is the explicitly-authorized stage that removes that
 * fallback entirely (task "IMPORTANT BACKWARD-COMPATIBILITY DECISION" —
 * "Do not [use a] global Razorpay merchant-commerce path... If an order
 * has no active merchant PaymentAccount at payment initiation, return a
 * stable application/domain error... Do not fall back to platform SaaS
 * credentials"), matching P8-3 §6 point 4's own already-ratified framing
 * ("no active account ⇒ checkout is blocked... never a generic 500"),
 * which P8-7's own §6.2 implementation-clarification note explicitly
 * deferred to "whichever later stage actually wires a PaymentAccount's
 * credentials into real payment creation" — this stage.
 *
 * Same hand-built-mock convention this codebase already establishes
 * (`payment-accounts.service.spec.ts` et al.) — no DB, no HTTP, no Nest
 * testing module, no real Razorpay SDK call anywhere (the adapter itself
 * is a hand-built mock here, not the real `RazorpayProviderAdapter` —
 * that class's own SDK-mocked tests live in
 * `razorpay/razorpay-provider-adapter.spec.ts`).
 */
describe('PaymentsService.initiatePayment — merchant PaymentAccount + provider adapter wiring (P8-9)', () => {
  const baseOrder = {
    id: 'order-1',
    userId: 'user-1',
    tenantId: 'tenant-a',
    storeId: 'store-a',
    status: OrderStatus.PENDING_PAYMENT,
    razorpayOrderId: null as string | null,
    paymentAccountId: null as string | null,
    total: new Prisma.Decimal('149.00'),
    currency: 'INR',
    orderNumber: 'PF-000001',
  };

  const ENCRYPTED_BLOB = Buffer.from('opaque-ciphertext-should-never-appear');

  function makeAdapter() {
    return {
      provider: PaymentProviderType.RAZORPAY,
      getPublicKeyId: jest.fn().mockReturnValue('rzp_merchant_key'),
      createOrder: jest.fn().mockResolvedValue({ providerOrderId: 'rzp_order_new' }),
      verifyPaymentSignature: jest.fn(),
      fetchOrderPayments: jest.fn(),
      createRefund: jest.fn(),
    };
  }

  function makePrisma(order: typeof baseOrder) {
    return {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(order),
      },
      paymentAttempt: {
        create: jest.fn().mockResolvedValue({ id: 'attempt-1' }),
      },
    };
  }

  function makeRazorpay() {
    // The global Phase-7/pre-Phase-8 singleton — P8-9's whole point is
    // that `initiatePayment` never calls ANY method on this for merchant
    // commerce payment creation. Every method throws if called, so any
    // regression back to the old global-credential path fails the test
    // immediately instead of silently passing with the wrong credentials.
    return {
      createOrder: jest.fn(() => {
        throw new Error('must never call the global RazorpayService for merchant commerce payment creation');
      }),
      getKeyId: jest.fn(() => {
        throw new Error('must never return the global/platform key id for a merchant commerce payment');
      }),
      verifySignature: jest.fn(),
      verifyWebhookSignature: jest.fn(),
    };
  }

  function makeResolutionService(opts: {
    resolveForStore?: jest.Mock;
    resolveForBoundAccount?: jest.Mock;
  }) {
    return {
      resolveForStore: opts.resolveForStore ?? jest.fn(),
      resolveForBoundAccount: opts.resolveForBoundAccount ?? jest.fn(),
    };
  }

  function makePaymentAccountsService(encrypted: Buffer | null = ENCRYPTED_BLOB) {
    return {
      getEncryptedCredentials: jest.fn().mockResolvedValue(encrypted),
    };
  }

  function resolvedFor(adapter: ReturnType<typeof makeAdapter>, paymentAccountId: string) {
    return { paymentAccountId, provider: PaymentProviderType.RAZORPAY, adapter };
  }

  // ─── happy path: fresh binding + provider order creation ──────────────

  it('resolves an ACTIVE PaymentAccount, binds it, and creates the provider order via the adapter using merchant credentials', async () => {
    const adapter = makeAdapter();
    const prisma = makePrisma({ ...baseOrder });
    const resolveForStore = jest.fn().mockResolvedValue(resolvedFor(adapter, 'pa-1'));
    const resolution = makeResolutionService({ resolveForStore });
    const paymentAccounts = makePaymentAccountsService();
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      paymentAccounts as never,
    );

    const result = await service.initiatePayment('user-1', 'order-1');

    expect(resolveForStore).toHaveBeenCalledWith('tenant-a', 'store-a', PaymentProviderType.RAZORPAY);
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', paymentAccountId: null },
      data: { paymentAccountId: 'pa-1' },
    });
    expect(paymentAccounts.getEncryptedCredentials).toHaveBeenCalledWith('tenant-a', 'pa-1');
    expect(adapter.createOrder).toHaveBeenCalledWith(ENCRYPTED_BLOB, {
      amountPaise: 14900n,
      currency: 'INR',
      receipt: 'PF-000001',
    });
    expect(result.razorpayOrderId).toBe('rzp_order_new');
    expect(result.razorpayKeyId).toBe('rzp_merchant_key');
  });

  it('persists Order.paymentAccountId and stamps the same id onto the created PaymentAttempt', async () => {
    const adapter = makeAdapter();
    const prisma = makePrisma({ ...baseOrder });
    const resolution = makeResolutionService({
      resolveForStore: jest.fn().mockResolvedValue(resolvedFor(adapter, 'pa-1')),
    });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await service.initiatePayment('user-1', 'order-1');

    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentAccountId: 'pa-1' } }),
    );
    expect(prisma.paymentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentAccountId: 'pa-1' }) }),
    );
  });

  it('platform/SaaS credentials are never used — the global RazorpayService is never called', async () => {
    const adapter = makeAdapter();
    const prisma = makePrisma({ ...baseOrder });
    const razorpayService = makeRazorpay();
    const resolution = makeResolutionService({
      resolveForStore: jest.fn().mockResolvedValue(resolvedFor(adapter, 'pa-1')),
    });
    const service = new PaymentsService(
      prisma as never,
      razorpayService as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await service.initiatePayment('user-1', 'order-1');

    expect(razorpayService.createOrder).not.toHaveBeenCalled();
    expect(razorpayService.getKeyId).not.toHaveBeenCalled();
  });

  it('resolves using the tenant derived from the Order, not any other value', async () => {
    const adapter = makeAdapter();
    const prisma = makePrisma({ ...baseOrder, tenantId: 'tenant-z' });
    const resolveForStore = jest.fn().mockResolvedValue(resolvedFor(adapter, 'pa-1'));
    const resolution = makeResolutionService({ resolveForStore });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await service.initiatePayment('user-1', 'order-1');

    expect(resolveForStore).toHaveBeenCalledWith('tenant-z', 'store-a', PaymentProviderType.RAZORPAY);
  });

  // ─── already-bound: never re-resolved from Store, uses resolveForBoundAccount ──

  it('does NOT call resolveForStore when the Order already has a bound paymentAccountId — uses resolveForBoundAccount instead', async () => {
    const adapter = makeAdapter();
    const prisma = makePrisma({ ...baseOrder, paymentAccountId: 'pa-already-bound' });
    const resolveForStore = jest.fn();
    const resolveForBoundAccount = jest.fn().mockResolvedValue(resolvedFor(adapter, 'pa-already-bound'));
    const resolution = makeResolutionService({ resolveForStore, resolveForBoundAccount });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await service.initiatePayment('user-1', 'order-1');

    expect(resolveForStore).not.toHaveBeenCalled();
    expect(resolveForBoundAccount).toHaveBeenCalledWith('tenant-a', 'pa-already-bound');
    expect(prisma.paymentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentAccountId: 'pa-already-bound' }) }),
    );
  });

  it('a bound PaymentAccount remains stable across repeated initiatePayment calls (retries) — never re-bound', async () => {
    const adapter = makeAdapter();
    const order = { ...baseOrder, paymentAccountId: 'pa-stable', razorpayOrderId: 'rzp_order_existing' };
    const prisma = makePrisma(order);
    const resolveForStore = jest.fn();
    const resolveForBoundAccount = jest.fn().mockResolvedValue(resolvedFor(adapter, 'pa-stable'));
    const resolution = makeResolutionService({ resolveForStore, resolveForBoundAccount });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await service.initiatePayment('user-1', 'order-1');
    await service.initiatePayment('user-1', 'order-1');

    expect(resolveForStore).not.toHaveBeenCalled();
    expect(prisma.order.updateMany.mock.calls).toEqual([]);
    expect(resolveForBoundAccount).toHaveBeenCalledTimes(2);
  });

  // ─── no storeId: structurally cannot resolve — fails cleanly ─────────

  it('fails with MerchantPaymentUnavailableError when the Order has no storeId (legacy/edge case) — no fallback', async () => {
    const prisma = makePrisma({ ...baseOrder, storeId: null as never });
    const resolution = makeResolutionService({ resolveForStore: jest.fn() });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await expect(service.initiatePayment('user-1', 'order-1')).rejects.toBeInstanceOf(
      MerchantPaymentUnavailableError,
    );
    expect(resolution.resolveForStore).not.toHaveBeenCalled();
    expect(prisma.paymentAttempt.create).not.toHaveBeenCalled();
  });

  // ─── missing/inactive PaymentAccount — fails cleanly, no fallback ────

  it('fails with MerchantPaymentUnavailableError (never a fallback) when there is no active PaymentAccount', async () => {
    const prisma = makePrisma({ ...baseOrder });
    const resolution = makeResolutionService({
      resolveForStore: jest
        .fn()
        .mockRejectedValue(new NoActivePaymentAccountError('store-a', PaymentProviderType.RAZORPAY)),
    });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await expect(service.initiatePayment('user-1', 'order-1')).rejects.toBeInstanceOf(
      MerchantPaymentUnavailableError,
    );
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.paymentAttempt.create).not.toHaveBeenCalled();
  });

  it('fails cleanly (disabled PaymentAccount) — proceeds no further, no PaymentAttempt created', async () => {
    const prisma = makePrisma({ ...baseOrder });
    const resolution = makeResolutionService({
      resolveForStore: jest
        .fn()
        .mockRejectedValue(new InactivePaymentAccountError('pa-disabled', PaymentAccountStatus.DISABLED)),
    });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await expect(service.initiatePayment('user-1', 'order-1')).rejects.toBeInstanceOf(
      MerchantPaymentUnavailableError,
    );
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.paymentAttempt.create).not.toHaveBeenCalled();
  });

  it('fails cleanly when the store cannot be confirmed', async () => {
    const prisma = makePrisma({ ...baseOrder });
    const resolution = makeResolutionService({
      resolveForStore: jest.fn().mockRejectedValue(new StoreNotFoundError('store-a')),
    });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await expect(service.initiatePayment('user-1', 'order-1')).rejects.toBeInstanceOf(
      MerchantPaymentUnavailableError,
    );
  });

  it('fails cleanly on a cross-tenant/store mismatch defense-in-depth error from a fresh resolution', async () => {
    const prisma = makePrisma({ ...baseOrder });
    const resolution = makeResolutionService({
      resolveForStore: jest.fn().mockRejectedValue(new PaymentAccountTenantMismatchError('pa-mismatch')),
    });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await expect(service.initiatePayment('user-1', 'order-1')).rejects.toBeInstanceOf(
      MerchantPaymentUnavailableError,
    );
  });

  it('fails cleanly when the bound account no longer resolves (e.g. tenant mismatch) via resolveForBoundAccount', async () => {
    const prisma = makePrisma({ ...baseOrder, paymentAccountId: 'pa-gone' });
    const resolution = makeResolutionService({
      resolveForBoundAccount: jest.fn().mockRejectedValue(new PaymentAccountTenantMismatchError('pa-gone')),
    });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await expect(service.initiatePayment('user-1', 'order-1')).rejects.toBeInstanceOf(
      MerchantPaymentUnavailableError,
    );
  });

  it('fails cleanly when the resolved account has no encrypted credentials configured yet', async () => {
    const adapter = makeAdapter();
    const prisma = makePrisma({ ...baseOrder });
    const resolution = makeResolutionService({
      resolveForStore: jest.fn().mockResolvedValue(resolvedFor(adapter, 'pa-1')),
    });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService(null) as never,
    );

    await expect(service.initiatePayment('user-1', 'order-1')).rejects.toBeInstanceOf(
      MerchantPaymentUnavailableError,
    );
    expect(adapter.createOrder).not.toHaveBeenCalled();
  });

  it('still propagates a genuine (non-resolution) error rather than swallowing it', async () => {
    const prisma = makePrisma({ ...baseOrder });
    const resolution = makeResolutionService({
      resolveForStore: jest.fn().mockRejectedValue(new Error('database is down')),
    });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await expect(service.initiatePayment('user-1', 'order-1')).rejects.toThrow('database is down');
  });

  // ─── provider/credential failure during createOrder ──────────────────

  it('translates a provider API error into PaymentProviderUnavailableError and creates no PaymentAttempt / no razorpayOrderId', async () => {
    const adapter = makeAdapter();
    adapter.createOrder.mockRejectedValue(
      new PaymentProviderApiError('boom', PaymentProviderType.RAZORPAY, 500, undefined, false),
    );
    const prisma = makePrisma({ ...baseOrder });
    const resolution = makeResolutionService({
      resolveForStore: jest.fn().mockResolvedValue(resolvedFor(adapter, 'pa-1')),
    });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await expect(service.initiatePayment('user-1', 'order-1')).rejects.toBeInstanceOf(
      PaymentProviderUnavailableError,
    );
    // Order.paymentAccountId WAS bound before the provider call (that part
    // succeeded), but razorpayOrderId must never be persisted, and no
    // PaymentAttempt must exist for a failed provider call.
    expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentAccountId: 'pa-1' } }),
    );
    expect(prisma.paymentAttempt.create).not.toHaveBeenCalled();
  });

  // ─── concurrency: CAS-guarded bind, never a silent account switch ────

  it('re-reads the winning paymentAccountId when it loses the CAS bind race, resolves THAT account, and never overwrites it', async () => {
    const losingAdapter = makeAdapter();
    const winningAdapter = makeAdapter();
    winningAdapter.createOrder.mockResolvedValue({ providerOrderId: 'rzp_order_from_winner' });
    const order = { ...baseOrder };
    const prisma = makePrisma(order);
    // Lost the race: another concurrent call already bound the order.
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    prisma.order.findUniqueOrThrow.mockResolvedValue({ ...order, paymentAccountId: 'pa-winner' });
    const resolveForStore = jest.fn().mockResolvedValue(resolvedFor(losingAdapter, 'pa-ours'));
    const resolveForBoundAccount = jest.fn().mockResolvedValue(resolvedFor(winningAdapter, 'pa-winner'));
    const resolution = makeResolutionService({ resolveForStore, resolveForBoundAccount });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await service.initiatePayment('user-1', 'order-1');

    expect(resolveForBoundAccount).toHaveBeenCalledWith('tenant-a', 'pa-winner');
    // The provider order must be created via the WINNING account's
    // adapter, never the one this call itself resolved and lost the race
    // for.
    expect(losingAdapter.createOrder).not.toHaveBeenCalled();
    expect(winningAdapter.createOrder).toHaveBeenCalled();
    expect(prisma.paymentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentAccountId: 'pa-winner' }) }),
    );
  });

  it('the CAS bind is scoped to paymentAccountId IS NULL — two concurrent binders can never both succeed', async () => {
    const adapter = makeAdapter();
    const prisma = makePrisma({ ...baseOrder });
    const resolution = makeResolutionService({
      resolveForStore: jest.fn().mockResolvedValue(resolvedFor(adapter, 'pa-1')),
    });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await service.initiatePayment('user-1', 'order-1');

    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ paymentAccountId: null }) }),
    );
  });

  it('concurrent initiation (simulated sequentially, both losing the razorpayOrderId race) creates only one provider order — the CAS loser reuses the winner\'s id, never calling adapter.createOrder twice for the same order', async () => {
    const adapter = makeAdapter();
    const order = { ...baseOrder, paymentAccountId: 'pa-1' };
    const prisma = makePrisma(order);
    // First call: wins the razorpayOrderId CAS.
    prisma.order.updateMany.mockResolvedValueOnce({ count: 1 });
    const resolution = makeResolutionService({
      resolveForBoundAccount: jest.fn().mockResolvedValue(resolvedFor(adapter, 'pa-1')),
    });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    const first = await service.initiatePayment('user-1', 'order-1');
    expect(adapter.createOrder).toHaveBeenCalledTimes(1);
    expect(first.razorpayOrderId).toBe('rzp_order_new');

    // Second call (retry): razorpayOrderId is already set on the order the
    // mock now returns — reuses it, never calls adapter.createOrder again.
    prisma.order.findUnique.mockResolvedValue({ ...order, razorpayOrderId: 'rzp_order_new' });
    const second = await service.initiatePayment('user-1', 'order-1');
    expect(adapter.createOrder).toHaveBeenCalledTimes(1);
    expect(second.razorpayOrderId).toBe('rzp_order_new');
  });

  it('retry does not create a duplicate provider order — reuses the already-persisted razorpayOrderId', async () => {
    const adapter = makeAdapter();
    const order = {
      ...baseOrder,
      paymentAccountId: 'pa-1',
      razorpayOrderId: 'rzp_order_existing',
    };
    const prisma = makePrisma(order);
    const resolution = makeResolutionService({
      resolveForBoundAccount: jest.fn().mockResolvedValue(resolvedFor(adapter, 'pa-1')),
    });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    const result = await service.initiatePayment('user-1', 'order-1');

    expect(adapter.createOrder).not.toHaveBeenCalled();
    expect(result.razorpayOrderId).toBe('rzp_order_existing');
    // The public key id is still fetched fresh every call (the frontend
    // widget needs it every time it opens) even though no new order was
    // created.
    expect(adapter.getPublicKeyId).toHaveBeenCalledWith(ENCRYPTED_BLOB);
  });

  // ─── PaymentAttempt inherits the resolved account, never independently resolves ──

  it('the PaymentAttempt is stamped with the SAME resolved account the provider order was created under', async () => {
    const adapter = makeAdapter();
    const prisma = makePrisma({ ...baseOrder, paymentAccountId: 'pa-existing' });
    const resolveForBoundAccount = jest.fn().mockResolvedValue(resolvedFor(adapter, 'pa-existing'));
    const resolution = makeResolutionService({ resolveForBoundAccount });
    const service = new PaymentsService(
      prisma as never,
      makeRazorpay() as never,
      resolution as never,
      makePaymentAccountsService() as never,
    );

    await service.initiatePayment('user-1', 'order-1');

    expect(resolution.resolveForStore).not.toHaveBeenCalled();
    expect(prisma.paymentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentAccountId: 'pa-existing' }) }),
    );
  });
});
