import { OrderStatus, Prisma } from '@prisma/client';
import { CheckoutService } from './checkout.service';

/**
 * Focused regression test for docs/architecture/PHASE-10-PROPOSAL.md §2.5:
 * before this fix, toOrderView() derived shippingFee as `total - subtotal`
 * on every read, which was only correct because discount was hardcoded to
 * zero. This test proves the fix by using fixture values where
 * `total - subtotal !== shippingFee` (impossible once a real discount
 * exists, but exactly the case that would silently return the wrong number
 * if the old derivation ever crept back in) and asserting the view reflects
 * the stored column, not a recomputation.
 *
 * Same direct-instantiation pattern as orders.service.spec.ts — toOrderView
 * is a pure mapping over already-loaded order data, so the other
 * constructor dependencies are never touched and can be stubbed with `never`.
 */
describe('CheckoutService.toOrderView — shippingFee read-back', () => {
  function buildService() {
    return new CheckoutService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  function buildOrder(
    overrides: Partial<{
      subtotal: string;
      shippingFee: string;
      total: string;
      discountAmount: string;
      couponCode: string | null;
    }> = {},
  ) {
    const values = {
      subtotal: '150.00',
      shippingFee: '49.00',
      total: '199.00',
      discountAmount: '0.00',
      couponCode: null,
      ...overrides,
    };
    return {
      id: 'order-1',
      orderNumber: 'PF-000001',
      userId: 'user-1',
      status: OrderStatus.PENDING_PAYMENT,
      subtotal: new Prisma.Decimal(values.subtotal),
      shippingFee: new Prisma.Decimal(values.shippingFee),
      total: new Prisma.Decimal(values.total),
      discountAmount: new Prisma.Decimal(values.discountAmount),
      taxableAmount: new Prisma.Decimal(values.subtotal).minus(
        new Prisma.Decimal(values.discountAmount),
      ),
      taxAmount: new Prisma.Decimal('0.00'),
      taxMode: 'INCLUSIVE',
      taxRateSnapshot: null,
      couponCode: values.couponCode,
      currency: 'INR',
      razorpayOrderId: null,
      shippingRecipientName: 'Jane Doe',
      shippingPhone: '9876543210',
      shippingAddressLine1: '123 Test St',
      shippingAddressLine2: null,
      shippingCity: 'Mumbai',
      shippingState: 'MH',
      shippingPostalCode: '400001',
      shippingCountry: 'India',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      items: [],
    };
  }

  it('reads shippingFee from the stored column, not from total - subtotal', () => {
    const service = buildService();
    // Deliberately inconsistent: total - subtotal = 40.00, but the stored
    // shippingFee is 49.00. The old derivation would have returned '40.00'.
    const order = buildOrder({
      subtotal: '150.00',
      shippingFee: '49.00',
      total: '190.00',
    });

    const view = (
      service as unknown as {
        toOrderView: (o: unknown) => { shippingFee: string };
      }
    ).toOrderView(order);

    expect(view.shippingFee).toBe('49.00');
  });

  it('still round-trips correctly in the ordinary case (no discount, total = subtotal + shippingFee)', () => {
    const service = buildService();
    const order = buildOrder({
      subtotal: '150.00',
      shippingFee: '49.00',
      total: '199.00',
    });

    const view = (
      service as unknown as {
        toOrderView: (o: unknown) => { shippingFee: string };
      }
    ).toOrderView(order);

    expect(view.shippingFee).toBe('49.00');
  });
});
