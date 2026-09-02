import { Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { PaymentMismatchError } from './payment-mismatch.error';

/**
 * Phase 13.3 §4 — exact amount/currency/order-id verification of a
 * Razorpay-reported capture. Pure guard, no DB. The transactional paths
 * that consume it (reconcileCapturedPayment / failStalePendingOrder /
 * applyCaptured) are exercised against a real database in
 * test/e2e/payment-reconciliation.e2e-spec.ts.
 */
describe('PaymentsService.assertCapturedPaymentMatchesOrder', () => {
  const service = new PaymentsService({} as never, {} as never);

  const order = {
    razorpayOrderId: 'order_abc',
    currency: 'INR',
    total: new Prisma.Decimal('149.00'), // -> 14900 paise
  };

  it('passes when order id, currency and amount all match exactly', () => {
    expect(() =>
      service.assertCapturedPaymentMatchesOrder(order, {
        razorpayOrderId: 'order_abc',
        amountPaise: 14900n,
        currency: 'INR',
      }),
    ).not.toThrow();
  });

  it('rejects a Razorpay order id that does not match', () => {
    try {
      service.assertCapturedPaymentMatchesOrder(order, {
        razorpayOrderId: 'order_SOMEONE_ELSE',
        amountPaise: 14900n,
        currency: 'INR',
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentMismatchError);
      expect((err as PaymentMismatchError).reason).toBe(
        'RAZORPAY_ORDER_ID_MISMATCH',
      );
    }
  });

  it('rejects a currency mismatch', () => {
    try {
      service.assertCapturedPaymentMatchesOrder(order, {
        razorpayOrderId: 'order_abc',
        amountPaise: 14900n,
        currency: 'USD',
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentMismatchError);
      expect((err as PaymentMismatchError).reason).toBe('CURRENCY_MISMATCH');
    }
  });

  it('rejects an amount mismatch — even one paise', () => {
    try {
      service.assertCapturedPaymentMatchesOrder(order, {
        razorpayOrderId: 'order_abc',
        amountPaise: 14899n,
        currency: 'INR',
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentMismatchError);
      expect((err as PaymentMismatchError).reason).toBe('AMOUNT_MISMATCH');
    }
  });

  it('uses exact bigint comparison (a larger over-charge is still a mismatch)', () => {
    expect(() =>
      service.assertCapturedPaymentMatchesOrder(order, {
        razorpayOrderId: 'order_abc',
        amountPaise: 1490000n,
        currency: 'INR',
      }),
    ).toThrow(PaymentMismatchError);
  });

  it('defaults the expected currency to INR when the order has none set', () => {
    expect(() =>
      service.assertCapturedPaymentMatchesOrder(
        {
          razorpayOrderId: 'order_abc',
          currency: '',
          total: new Prisma.Decimal('149.00'),
        },
        { razorpayOrderId: 'order_abc', amountPaise: 14900n, currency: 'INR' },
      ),
    ).not.toThrow();
  });
});
