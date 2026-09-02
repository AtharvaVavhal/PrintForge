jest.mock('@sentry/node');
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
    const service = new PaymentReconciliationService(
      prisma as never,
      razorpayService as never,
      paymentsService as never,
    );
    return { service, razorpayService, paymentsService };
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
});
