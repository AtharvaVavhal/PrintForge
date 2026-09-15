jest.mock('@sentry/node');
import { PaymentAccountTenantMismatchError } from './payment-accounts/payment-account-resolution.errors';
import { PaymentReconciliationService } from './payment-reconciliation.service';

/**
 * Phase 13.3 §1 — routing decisions of the reconciliation cron: which
 * Razorpay payment shape leads to which local action. The real
 * transactional state transitions are covered against a live database in
 * test/e2e/payment-reconciliation.e2e-spec.ts.
 */
describe('PaymentReconciliationService — routing', () => {
  const FRESH = new Date();
  const STALE = new Date(Date.now() - 200 * 60_000); // > FAIL_STALE_AFTER (180m)

  function build(opts: {
    candidates?: Array<Record<string, unknown>>;
    noRzpOrders?: Array<Record<string, unknown>>;
    payments?: unknown[];
    fetchThrows?: boolean;
  }) {
    const prisma = {
      order: {
        findMany: jest
          .fn()
          .mockImplementation(
            (args: { where: { razorpayOrderId?: unknown } }) => {
              const wantsNull = args.where.razorpayOrderId === null;
              return Promise.resolve(
                wantsNull ? (opts.noRzpOrders ?? []) : (opts.candidates ?? []),
              );
            },
          ),
      },
    };
    const razorpayService = {
      isConfigured: jest.fn().mockReturnValue(true),
      fetchOrderPayments: opts.fetchThrows
        ? jest.fn().mockRejectedValue(new Error('rzp down'))
        : jest.fn().mockResolvedValue(opts.payments ?? []),
    };
    const paymentsService = {
      reconcileCapturedPayment: jest.fn().mockResolvedValue('PAID'),
      failStalePendingOrder: jest.fn().mockResolvedValue(true),
    };
    const paymentAccountResolutionService: { resolveForBoundAccount: jest.Mock } = {
      resolveForBoundAccount: jest.fn(() => {
        throw new Error('resolveForBoundAccount must not be called for an unbound order');
      }),
    };
    const paymentAccountsService: { getEncryptedCredentials: jest.Mock } = {
      getEncryptedCredentials: jest.fn(() => {
        throw new Error('getEncryptedCredentials must not be called for an unbound order');
      }),
    };
    const service = new PaymentReconciliationService(
      prisma as never,
      razorpayService as never,
      paymentsService as never,
      paymentAccountResolutionService as never,
      paymentAccountsService as never,
    );
    return {
      service,
      razorpayService,
      paymentsService,
      paymentAccountResolutionService,
      paymentAccountsService,
    };
  }

  const order = (over: Record<string, unknown> = {}) => ({
    id: 'o1',
    orderNumber: 'PF-000001',
    status: 'PENDING_PAYMENT',
    razorpayOrderId: 'rzp_o1',
    createdAt: STALE,
    ...over,
  });

  const payment = (over: Record<string, unknown> = {}) => ({
    id: 'pay_1',
    razorpayOrderId: 'rzp_o1',
    amountPaise: 15000n,
    currency: 'INR',
    status: 'captured',
    captured: true,
    method: 'upi',
    ...over,
  });

  it('a captured payment routes to reconcileCapturedPayment', async () => {
    const { service, paymentsService } = build({
      candidates: [order()],
      payments: [payment()],
    });

    await service.reconcile();

    expect(paymentsService.reconcileCapturedPayment).toHaveBeenCalledTimes(1);
    expect(paymentsService.failStalePendingOrder).not.toHaveBeenCalled();
  });

  it('no payment on a stale order routes to failStalePendingOrder', async () => {
    const { service, paymentsService } = build({
      candidates: [order()],
      payments: [],
    });

    await service.reconcile();

    expect(paymentsService.failStalePendingOrder).toHaveBeenCalledTimes(1);
    expect(paymentsService.reconcileCapturedPayment).not.toHaveBeenCalled();
  });

  it('no payment on a still-fresh order is left alone', async () => {
    const { service, paymentsService } = build({
      candidates: [order({ createdAt: FRESH })],
      payments: [],
    });

    await service.reconcile();

    expect(paymentsService.failStalePendingOrder).not.toHaveBeenCalled();
    expect(paymentsService.reconcileCapturedPayment).not.toHaveBeenCalled();
  });

  it('an authorized-but-not-captured payment triggers neither transition', async () => {
    const { service, paymentsService } = build({
      candidates: [order()],
      payments: [payment({ status: 'authorized', captured: false })],
    });

    await service.reconcile();

    expect(paymentsService.reconcileCapturedPayment).not.toHaveBeenCalled();
    expect(paymentsService.failStalePendingOrder).not.toHaveBeenCalled();
  });

  it('a non-captured (failed) payment does not mark paid and (if stale) fails the order', async () => {
    const { service, paymentsService } = build({
      candidates: [order()],
      payments: [payment({ status: 'failed', captured: false })],
    });

    await service.reconcile();

    expect(paymentsService.reconcileCapturedPayment).not.toHaveBeenCalled();
    expect(paymentsService.failStalePendingOrder).toHaveBeenCalledTimes(1);
  });

  it('a Razorpay fetch failure transitions nothing', async () => {
    const { service, paymentsService } = build({
      candidates: [order()],
      fetchThrows: true,
    });

    await service.reconcile();

    expect(paymentsService.reconcileCapturedPayment).not.toHaveBeenCalled();
    expect(paymentsService.failStalePendingOrder).not.toHaveBeenCalled();
  });

  it('skips the Razorpay API entirely when not configured, but still fails stale no-Razorpay-order orders', async () => {
    const { service, razorpayService, paymentsService } = build({
      noRzpOrders: [order({ razorpayOrderId: null })],
    });
    razorpayService.isConfigured.mockReturnValue(false);

    await service.reconcile();

    expect(razorpayService.fetchOrderPayments).not.toHaveBeenCalled();
    expect(paymentsService.failStalePendingOrder).toHaveBeenCalledTimes(1);
  });

  // ─── P8-10 — merchant-bound account routing (task items 9/12) ────────

  describe('merchant-bound PaymentAccount routing', () => {
    const merchantAdapter = () => ({
      fetchOrderPayments: jest.fn().mockResolvedValue([
        {
          providerPaymentId: 'pay_1',
          providerOrderId: 'rzp_o1',
          amountPaise: 15000n,
          currency: 'INR',
          status: 'captured',
          captured: true,
          method: 'upi',
        },
      ]),
    });

    function buildBound(adapter = merchantAdapter()) {
      const built = build({ candidates: [order({ paymentAccountId: 'pa-1', tenantId: 'tenant-a' })] });
      built.paymentAccountResolutionService.resolveForBoundAccount = jest
        .fn()
        .mockResolvedValue({ paymentAccountId: 'pa-1', provider: 'RAZORPAY', adapter });
      built.paymentAccountsService.getEncryptedCredentials = jest
        .fn()
        .mockResolvedValue(Buffer.from('opaque'));
      return { ...built, adapter };
    }

    it('fetches payments via the bound PaymentAccount\'s own adapter/credentials, never the global RazorpayService', async () => {
      const { service, razorpayService, adapter, paymentAccountResolutionService } = buildBound();

      await service.reconcile();

      expect(paymentAccountResolutionService.resolveForBoundAccount).toHaveBeenCalledWith(
        'tenant-a',
        'pa-1',
      );
      expect(adapter.fetchOrderPayments).toHaveBeenCalledWith(
        Buffer.from('opaque'),
        'rzp_o1',
      );
      expect(razorpayService.fetchOrderPayments).not.toHaveBeenCalled();
    });

    it('reconciles a bound order to PAID exactly like the global path, using the merchant-fetched payment', async () => {
      const { service, paymentsService } = buildBound();

      await service.reconcile();

      expect(paymentsService.reconcileCapturedPayment).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'o1' }),
        expect.objectContaining({ id: 'pay_1', razorpayOrderId: 'rzp_o1' }),
      );
    });

    it('proceeds for a bound order even when the global RazorpayService is NOT configured', async () => {
      const { service, razorpayService, adapter } = buildBound();
      razorpayService.isConfigured.mockReturnValue(false);

      await service.reconcile();

      expect(adapter.fetchOrderPayments).toHaveBeenCalled();
    });

    it('skips (retries next run) when the bound account no longer resolves, without throwing', async () => {
      const { service, paymentAccountResolutionService, paymentsService } = buildBound();
      paymentAccountResolutionService.resolveForBoundAccount = jest
        .fn()
        .mockRejectedValue(new PaymentAccountTenantMismatchError('pa-1'));

      await expect(service.reconcile()).resolves.toBeUndefined();
      expect(paymentsService.reconcileCapturedPayment).not.toHaveBeenCalled();
      expect(paymentsService.failStalePendingOrder).not.toHaveBeenCalled();
    });

    it('skips (retries next run) when the resolved account has no encrypted credentials', async () => {
      const { service, paymentAccountsService, paymentsService } = buildBound();
      paymentAccountsService.getEncryptedCredentials = jest.fn().mockResolvedValue(null);

      await service.reconcile();

      expect(paymentsService.reconcileCapturedPayment).not.toHaveBeenCalled();
    });

    it('a provider fetch failure via the bound adapter transitions nothing and never falls back to the global service', async () => {
      const failingAdapter = {
        fetchOrderPayments: jest.fn().mockRejectedValue(new Error('rzp merchant down')),
      };
      const { service, razorpayService, paymentsService } = buildBound(failingAdapter);

      await service.reconcile();

      expect(paymentsService.reconcileCapturedPayment).not.toHaveBeenCalled();
      expect(paymentsService.failStalePendingOrder).not.toHaveBeenCalled();
      expect(razorpayService.fetchOrderPayments).not.toHaveBeenCalled();
    });
  });
});
