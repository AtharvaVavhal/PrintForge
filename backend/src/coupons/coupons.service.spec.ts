import { BadRequestException, ConflictException } from '@nestjs/common';
import { CouponScopeType, CouponType, Prisma } from '@prisma/client';
import { CouponsService, ValidateCouponParams } from './coupons.service';

/**
 * Same direct-instantiation mocking pattern as orders.service.spec.ts.
 * `validateAndClaim`/`previewDiscount` are exercised through a fake `tx`
 * (structurally the same shape `Prisma.TransactionClient` and
 * `PrismaService` both satisfy) exposing only the handful of Prisma calls
 * these methods actually make — no real database. The atomic CAS itself
 * (`UPDATE ... WHERE usedCount < usageLimitTotal RETURNING id`) is
 * simulated via a controllable `$queryRaw` mock; its actual race-safety
 * is a property of the SQL running against real Postgres, verified live
 * against the dev database (see the phase report), not something a
 * mocked unit test can prove on its own — this suite instead proves
 * CouponsService's *control flow* around that CAS result is correct:
 * zero rows throws 409, non-zero rows proceeds.
 */
describe('CouponsService', () => {
  function buildCoupon(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'coupon-1',
      code: 'SAVE20',
      type: CouponType.PERCENTAGE,
      percentageOff: 20,
      flatAmountOff: null,
      scopeType: CouponScopeType.STORE_WIDE,
      categoryId: null,
      minOrderValue: null,
      usageLimitTotal: null,
      usageLimitPerUser: 1,
      usedCount: 0,
      firstOrderOnly: false,
      startsAt: null,
      expiresAt: null,
      isActive: true,
      description: null,
      createdByAdminId: 'admin-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  function buildTx(
    coupon: ReturnType<typeof buildCoupon> | null,
    options: {
      orderCount?: number;
      usageCount?: number;
      claimReturnsRow?: boolean;
    } = {},
  ) {
    const { orderCount = 0, usageCount = 0, claimReturnsRow = true } = options;
    return {
      coupon: { findUnique: jest.fn().mockResolvedValue(coupon) },
      order: { count: jest.fn().mockResolvedValue(orderCount) },
      couponUsage: {
        count: jest.fn().mockResolvedValue(usageCount),
        create: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue(claimReturnsRow ? [{ id: coupon?.id }] : []),
    };
  }

  function buildParams(
    overrides: Partial<ValidateCouponParams> = {},
  ): ValidateCouponParams {
    return {
      code: 'save20',
      userId: 'user-1',
      subtotalPaise: 100_00n,
      shippingFeePaise: 49_00n,
      lineItems: [{ categoryId: 'cat-mugs', lineTotalPaise: 100_00n }],
      ...overrides,
    };
  }

  describe('per-type discount calculation', () => {
    it('PERCENTAGE: discounts scopedSubtotalPaise by the configured percentage', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({
        type: CouponType.PERCENTAGE,
        percentageOff: 20,
      });
      const tx = buildTx(coupon);

      const result = await service.validateAndClaim(
        tx as never,
        buildParams({ subtotalPaise: 100_00n }),
      );

      expect(result.discountPaise).toBe(20_00n); // 20% of ₹100.00
      expect(result.shippingFeePaise).toBe(49_00n); // unchanged
    });

    it('FLAT_AMOUNT: discounts by the flat amount when it fits under the subtotal', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({
        type: CouponType.FLAT_AMOUNT,
        percentageOff: null,
        flatAmountOff: new Prisma.Decimal('30.00'),
      });
      const tx = buildTx(coupon);

      const result = await service.validateAndClaim(
        tx as never,
        buildParams({ subtotalPaise: 100_00n }),
      );

      expect(result.discountPaise).toBe(30_00n);
      expect(result.shippingFeePaise).toBe(49_00n);
    });

    it('FLAT_AMOUNT: caps the discount at scopedSubtotalPaise, never exceeding it (total can never go negative)', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({
        type: CouponType.FLAT_AMOUNT,
        percentageOff: null,
        flatAmountOff: new Prisma.Decimal('500.00'), // way more than the subtotal
      });
      const tx = buildTx(coupon);

      const result = await service.validateAndClaim(
        tx as never,
        buildParams({ subtotalPaise: 100_00n }),
      );

      // Capped at the subtotal it's discounting, not the full ₹500.00.
      expect(result.discountPaise).toBe(100_00n);
    });

    it('FREE_SHIPPING: zero discount, but shippingFeePaise is overridden to 0', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({
        type: CouponType.FREE_SHIPPING,
        percentageOff: null,
        flatAmountOff: null,
      });
      const tx = buildTx(coupon);

      const result = await service.validateAndClaim(
        tx as never,
        buildParams({ subtotalPaise: 100_00n, shippingFeePaise: 49_00n }),
      );

      expect(result.discountPaise).toBe(0n);
      expect(result.shippingFeePaise).toBe(0n);
    });
  });

  describe('category-scope isolation', () => {
    it('a CATEGORY-scoped coupon only discounts matching line items, not the whole cart', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({
        type: CouponType.PERCENTAGE,
        percentageOff: 10,
        scopeType: CouponScopeType.CATEGORY,
        categoryId: 'cat-mugs',
      });
      const tx = buildTx(coupon);

      const result = await service.validateAndClaim(
        tx as never,
        buildParams({
          subtotalPaise: 300_00n, // full cart total
          lineItems: [
            { categoryId: 'cat-mugs', lineTotalPaise: 100_00n },
            { categoryId: 'cat-shirts', lineTotalPaise: 200_00n }, // not this coupon's category
          ],
        }),
      );

      // 10% of only the ₹100.00 mug line, not the full ₹300.00 cart.
      expect(result.discountPaise).toBe(10_00n);
    });

    it('rejects a CATEGORY-scoped coupon when nothing in the cart matches its category', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({
        scopeType: CouponScopeType.CATEGORY,
        categoryId: 'cat-mugs',
      });
      const tx = buildTx(coupon);

      await expect(
        service.validateAndClaim(
          tx as never,
          buildParams({
            lineItems: [{ categoryId: 'cat-shirts', lineTotalPaise: 200_00n }],
          }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('a STORE_WIDE coupon discounts the whole subtotal regardless of per-item categories', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({
        type: CouponType.PERCENTAGE,
        percentageOff: 10,
        scopeType: CouponScopeType.STORE_WIDE,
      });
      const tx = buildTx(coupon);

      const result = await service.validateAndClaim(
        tx as never,
        buildParams({
          subtotalPaise: 300_00n,
          lineItems: [
            { categoryId: 'cat-mugs', lineTotalPaise: 100_00n },
            { categoryId: 'cat-shirts', lineTotalPaise: 200_00n },
          ],
        }),
      );

      expect(result.discountPaise).toBe(30_00n); // 10% of the full ₹300.00
    });
  });

  describe('usage-limit exhaustion (concurrent claims)', () => {
    it('throws 409 when the atomic CAS claim returns zero rows (lost the race to a concurrent claim)', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({ usageLimitTotal: 10, usedCount: 9 });
      // Simulates: by the time this UPDATE runs, another transaction's
      // commit already pushed usedCount to 10 — the CAS's WHERE clause no
      // longer matches, so RETURNING gives back zero rows.
      const tx = buildTx(coupon, { claimReturnsRow: false });

      await expect(
        service.validateAndClaim(tx as never, buildParams()),
      ).rejects.toThrow(ConflictException);
    });

    it('succeeds when the CAS claim returns a row (usage limit not yet reached)', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({ usageLimitTotal: 10, usedCount: 5 });
      const tx = buildTx(coupon, { claimReturnsRow: true });

      await expect(
        service.validateAndClaim(tx as never, buildParams()),
      ).resolves.toBeDefined();
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('a coupon with no usageLimitTotal (unlimited) is never blocked by the CAS', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({ usageLimitTotal: null, usedCount: 100_000 });
      const tx = buildTx(coupon, { claimReturnsRow: true });

      await expect(
        service.validateAndClaim(tx as never, buildParams()),
      ).resolves.toBeDefined();
    });
  });

  describe('per-user usage limit', () => {
    it('rejects (400, not the CAS/409) when this user has already used the coupon usageLimitPerUser times', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({ usageLimitPerUser: 1 });
      const tx = buildTx(coupon, { usageCount: 1 });

      await expect(
        service.validateAndClaim(tx as never, buildParams()),
      ).rejects.toThrow(BadRequestException);
      // Rejected before ever attempting the total-usage CAS.
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('allows a user under their per-user limit', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({ usageLimitPerUser: 2 });
      const tx = buildTx(coupon, { usageCount: 1 });

      await expect(
        service.validateAndClaim(tx as never, buildParams()),
      ).resolves.toBeDefined();
    });

    it('a coupon with no usageLimitPerUser (null, unlimited per user) is never blocked here', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({ usageLimitPerUser: null });
      const tx = buildTx(coupon, { usageCount: 50 });

      await expect(
        service.validateAndClaim(tx as never, buildParams()),
      ).resolves.toBeDefined();
    });
  });

  describe('firstOrderOnly', () => {
    it('rejects a user who already has at least one order, of any status', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({ firstOrderOnly: true });
      const tx = buildTx(coupon, { orderCount: 1 });

      await expect(
        service.validateAndClaim(tx as never, buildParams()),
      ).rejects.toThrow(BadRequestException);
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('allows a user with zero prior orders', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({ firstOrderOnly: true });
      const tx = buildTx(coupon, { orderCount: 0 });

      await expect(
        service.validateAndClaim(tx as never, buildParams()),
      ).resolves.toBeDefined();
    });
  });

  describe('minOrderValue', () => {
    it('rejects when the scoped subtotal is below the coupon minimum', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({
        minOrderValue: new Prisma.Decimal('200.00'),
      });
      const tx = buildTx(coupon);

      await expect(
        service.validateAndClaim(
          tx as never,
          buildParams({ subtotalPaise: 100_00n }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows when the scoped subtotal meets the minimum exactly', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({
        minOrderValue: new Prisma.Decimal('100.00'),
      });
      const tx = buildTx(coupon);

      await expect(
        service.validateAndClaim(
          tx as never,
          buildParams({ subtotalPaise: 100_00n }),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('inactive / expired / not-yet-started coupons', () => {
    it('rejects an inactive coupon', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({ isActive: false });
      const tx = buildTx(coupon);

      await expect(
        service.validateAndClaim(tx as never, buildParams()),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an expired coupon', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      });
      const tx = buildTx(coupon);

      await expect(
        service.validateAndClaim(tx as never, buildParams()),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a coupon that has not started yet', async () => {
      const service = new CouponsService({} as never);
      const coupon = buildCoupon({
        startsAt: new Date('2099-01-01T00:00:00.000Z'),
      });
      const tx = buildTx(coupon);

      await expect(
        service.validateAndClaim(tx as never, buildParams()),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown coupon code', async () => {
      const service = new CouponsService({} as never);
      const tx = buildTx(null);

      await expect(
        service.validateAndClaim(tx as never, buildParams({ code: 'NOPE' })),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('previewDiscount (read-only, no claim)', () => {
    it('computes the same discount as validateAndClaim but never touches $queryRaw or increments usedCount', async () => {
      const coupon = buildCoupon({
        type: CouponType.PERCENTAGE,
        percentageOff: 20,
      });
      const tx = buildTx(coupon);
      // previewDiscount uses `this.prisma`, not a tx — inject the same
      // fake object as the constructor's PrismaService.
      const previewService = new CouponsService(tx as never);

      const result = await previewService.previewDiscount(
        buildParams({ subtotalPaise: 100_00n }),
      );

      expect(result.discountPaise).toBe(20_00n);
      expect(result.couponCode).toBe('SAVE20');
      expect(tx.$queryRaw).not.toHaveBeenCalled();
      expect(tx.couponUsage.create).not.toHaveBeenCalled();
    });

    it('still enforces every validation rule (e.g. expired) the same as validateAndClaim', async () => {
      const coupon = buildCoupon({
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      });
      const tx = buildTx(coupon);
      const previewService = new CouponsService(tx as never);

      await expect(
        previewService.previewDiscount(buildParams()),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
