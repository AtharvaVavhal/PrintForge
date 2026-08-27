import { ConflictException } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { ReviewsService } from './reviews.service';

/**
 * Same direct-instantiation mocking pattern as orders.service.spec.ts.
 * `prisma.$transaction` is mocked to just invoke its callback with a fake
 * `tx` client, so these tests exercise the real transaction body (the
 * eligibility check, the create, the aggregate recompute) without a
 * database.
 */
/** Prisma.Decimal doesn't compare equal via toEqual — match by string
 * representation instead of indexing into jest's untyped mock-call
 * history (which would otherwise need an `any`-laundering cast). */
function decimalToString(expected: string) {
  return {
    asymmetricMatch: (actual: { toString(): string }) =>
      actual.toString() === expected,
    toString: () => `Decimal(${expected})`,
  };
}

describe('ReviewsService', () => {
  function buildService() {
    const tx = {
      review: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      product: {
        update: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const ordersService = {
      findDeliveredOrderItemForProduct: jest.fn(),
    };
    const service = new ReviewsService(prisma as never, ordersService as never);
    return { service, tx, ordersService };
  }

  function buildReviewRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'review-1',
      productId: 'prod-1',
      userId: 'user-1',
      orderItemId: 'item-1',
      rating: 5,
      bodyText: null,
      status: ReviewStatus.PUBLISHED,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  describe('createReview — verified-purchase gate', () => {
    it('ALLOW: creates the review when the user has a DELIVERED order-item for the product', async () => {
      const { service, tx, ordersService } = buildService();
      ordersService.findDeliveredOrderItemForProduct.mockResolvedValue({
        id: 'item-1',
      });
      tx.review.create.mockResolvedValue(buildReviewRow());
      tx.review.aggregate.mockResolvedValue({
        _avg: { rating: 5 },
        _count: { _all: 1 },
      });

      const result = await service.createReview('user-1', {
        productId: 'prod-1',
        rating: 5,
      });

      expect(result.id).toBe('review-1');
      expect(
        ordersService.findDeliveredOrderItemForProduct,
      ).toHaveBeenCalledWith(tx, 'user-1', 'prod-1');
      // The resolved order item's id becomes the review's verified-purchase
      // anchor — never a client-supplied value (CreateReviewDto has no
      // orderItemId field at all).
      expect(tx.review.create).toHaveBeenCalledWith({
        data: {
          productId: 'prod-1',
          userId: 'user-1',
          orderItemId: 'item-1',
          rating: 5,
          bodyText: null,
        },
      });
    });

    it('DENY: rejects with 409 when the user has no qualifying DELIVERED order-item, and never writes a review', async () => {
      const { service, tx, ordersService } = buildService();
      ordersService.findDeliveredOrderItemForProduct.mockResolvedValue(null);

      await expect(
        service.createReview('user-1', { productId: 'prod-1', rating: 5 }),
      ).rejects.toThrow(ConflictException);

      expect(tx.review.create).not.toHaveBeenCalled();
      expect(tx.product.update).not.toHaveBeenCalled();
    });

    it('DENY: a PAID (not yet DELIVERED) order does not satisfy the gate — findDeliveredOrderItemForProduct itself only ever looks for DELIVERED, so a null result here covers "bought but not delivered" the same way as "never bought"', async () => {
      const { service, tx, ordersService } = buildService();
      // OrdersService.findDeliveredOrderItemForProduct is the single source
      // of truth for eligibility — from ReviewsService's side, "order
      // exists but isn't DELIVERED yet" and "no order at all" are
      // indistinguishable, and correctly so: both must return null.
      ordersService.findDeliveredOrderItemForProduct.mockResolvedValue(null);

      await expect(
        service.createReview('user-1', { productId: 'prod-1', rating: 4 }),
      ).rejects.toThrow(
        'You can only review a product from an order that has been delivered to you',
      );
      expect(tx.review.create).not.toHaveBeenCalled();
    });
  });

  describe('avgRating/reviewCount recompute', () => {
    it('sets avgRating to null and reviewCount to 0 when there are zero published reviews for the product', async () => {
      const { service, tx, ordersService } = buildService();
      ordersService.findDeliveredOrderItemForProduct.mockResolvedValue({
        id: 'item-1',
      });
      tx.review.create.mockResolvedValue(buildReviewRow());
      // The just-created review is REMOVED/REJECTED-equivalent for this
      // test's purposes — simulate an aggregate that (for whatever reason,
      // e.g. it was immediately moderated away in the same request in a
      // future extension) sees zero PUBLISHED rows.
      tx.review.aggregate.mockResolvedValue({
        _avg: { rating: null },
        _count: { _all: 0 },
      });

      await service.createReview('user-1', { productId: 'prod-1', rating: 5 });

      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { reviewCount: 0, avgRating: null },
      });
    });

    it('rounds the recomputed average to 2 decimal places', async () => {
      const { service, tx, ordersService } = buildService();
      ordersService.findDeliveredOrderItemForProduct.mockResolvedValue({
        id: 'item-1',
      });
      tx.review.create.mockResolvedValue(buildReviewRow());
      // 3 published reviews averaging 4.3333...
      tx.review.aggregate.mockResolvedValue({
        _avg: { rating: 13 / 3 },
        _count: { _all: 3 },
      });

      await service.createReview('user-1', { productId: 'prod-1', rating: 5 });

      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { reviewCount: 3, avgRating: decimalToString('4.33') },
      });
    });

    it('locks the product row before reading the aggregate (recompute is lock-then-read-then-write, not blind read-then-write)', async () => {
      const { service, tx, ordersService } = buildService();
      ordersService.findDeliveredOrderItemForProduct.mockResolvedValue({
        id: 'item-1',
      });
      tx.review.create.mockResolvedValue(buildReviewRow());
      tx.review.aggregate.mockResolvedValue({
        _avg: { rating: 5 },
        _count: { _all: 1 },
      });

      await service.createReview('user-1', { productId: 'prod-1', rating: 5 });

      expect(tx.$queryRaw).toHaveBeenCalled();
      // The lock must happen before the aggregate SELECT — otherwise two
      // concurrent recomputes for the same product could both read a stale
      // aggregate before either commits (docs/architecture/
      // PHASE-10-PROPOSAL.md's read-then-write lost-update concern).
      const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0];
      const aggregateOrder = tx.review.aggregate.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(aggregateOrder);
    });
  });
});
