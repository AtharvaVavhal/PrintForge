import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Coupon, CouponScopeType, CouponType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { PaginatedResult } from '../common/types/api-response.interface';
import {
  decimalToPaise,
  paiseToDecimalString,
} from '../cart/pricing/money.util';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { ListAdminCouponsQueryDto } from './dto/list-admin-coupons-query.dto';
import { CouponView } from './dto/coupon-view.interface';

/** A cart line, reduced to only what coupon scoping/discount math needs —
 * CheckoutService builds this from its own already-loaded cart items, no
 * new query. */
export interface CouponLineItem {
  categoryId: string;
  lineTotalPaise: bigint;
}

export interface ValidateCouponParams {
  code: string;
  userId: string;
  subtotalPaise: bigint;
  shippingFeePaise: bigint;
  lineItems: CouponLineItem[];
}

export interface CouponDiscountResult {
  couponId: string;
  couponCode: string;
  discountPaise: bigint;
  shippingFeePaise: bigint;
}

/** No `couponId` — a preview claims nothing, so there's no claim to
 * identify by id; the normalized code is enough for the response. */
export interface CouponPreviewResult {
  couponCode: string;
  discountPaise: bigint;
  shippingFeePaise: bigint;
}

/** Both `PrismaService` and `Prisma.TransactionClient` expose the same
 * read methods used here (findUnique/count) — `PrismaService` is
 * structurally a superset, so a plain (non-transactional) call from the
 * checkout-preview path can pass `this.prisma` directly wherever a `tx`
 * is expected, without a second code path. */
type PrismaOrTx = Prisma.TransactionClient;

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Admin CRUD (GET/POST/PATCH /admin/coupons[/:id]) ───────────────────

  async listCoupons(
    query: ListAdminCouponsQueryDto,
  ): Promise<PaginatedResult<CouponView>> {
    const where: Prisma.CouponWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.toView(row)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async getCoupon(id: string): Promise<CouponView> {
    const coupon = await this.getCouponOrThrow(id);
    return this.toView(coupon);
  }

  /**
   * Cross-field rules (percentageOff required iff type=PERCENTAGE, etc.)
   * are validated here, not via @ValidateIf on the DTO — see
   * CreateCouponDto's doc comment. `categoryId` existence is a flat query
   * against `categories` directly via the shared PrismaService, not a
   * ProductsModule import (confirmed against admin.service.ts's identical
   * direct-query pattern for User/Order — PHASE-10-PROPOSAL.md §2.3).
   */
  async createCoupon(
    adminId: string,
    dto: CreateCouponDto,
  ): Promise<CouponView> {
    this.assertTypeFieldsConsistent(dto);
    await this.assertScopeFieldsConsistent(dto);

    try {
      const created = await this.prisma.coupon.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          type: dto.type,
          percentageOff:
            dto.type === CouponType.PERCENTAGE ? dto.percentageOff : null,
          flatAmountOff:
            dto.type === CouponType.FLAT_AMOUNT ? dto.flatAmountOff : null,
          scopeType: dto.scopeType,
          categoryId:
            dto.scopeType === CouponScopeType.CATEGORY ? dto.categoryId : null,
          minOrderValue: dto.minOrderValue,
          usageLimitTotal: dto.usageLimitTotal,
          usageLimitPerUser: dto.usageLimitPerUser ?? 1,
          firstOrderOnly: dto.firstOrderOnly ?? false,
          startsAt: dto.startsAt,
          expiresAt: dto.expiresAt,
          description: dto.description,
          createdByAdminId: adminId,
        },
      });
      return this.toView(created);
    } catch (err) {
      this.mapUniqueConstraintError(
        err,
        'A coupon with this code already exists',
      );
    }
  }

  async updateCoupon(id: string, dto: UpdateCouponDto): Promise<CouponView> {
    await this.getCouponOrThrow(id);
    const updated = await this.prisma.coupon.update({
      where: { id },
      data: {
        minOrderValue: dto.minOrderValue,
        usageLimitTotal: dto.usageLimitTotal,
        usageLimitPerUser: dto.usageLimitPerUser,
        firstOrderOnly: dto.firstOrderOnly,
        startsAt: dto.startsAt,
        expiresAt: dto.expiresAt,
        isActive: dto.isActive,
        description: dto.description,
      },
    });
    return this.toView(updated);
  }

  private assertTypeFieldsConsistent(dto: CreateCouponDto): void {
    if (dto.type === CouponType.PERCENTAGE) {
      if (dto.percentageOff === undefined) {
        throw new BadRequestException(
          'percentageOff is required for a PERCENTAGE coupon',
        );
      }
      if (dto.flatAmountOff !== undefined) {
        throw new BadRequestException(
          'flatAmountOff must not be set for a PERCENTAGE coupon',
        );
      }
    } else if (dto.type === CouponType.FLAT_AMOUNT) {
      if (dto.flatAmountOff === undefined) {
        throw new BadRequestException(
          'flatAmountOff is required for a FLAT_AMOUNT coupon',
        );
      }
      if (dto.percentageOff !== undefined) {
        throw new BadRequestException(
          'percentageOff must not be set for a FLAT_AMOUNT coupon',
        );
      }
    } else if (
      dto.percentageOff !== undefined ||
      dto.flatAmountOff !== undefined
    ) {
      throw new BadRequestException(
        'percentageOff/flatAmountOff must not be set for a FREE_SHIPPING coupon',
      );
    }
  }

  private async assertScopeFieldsConsistent(
    dto: CreateCouponDto,
  ): Promise<void> {
    if (dto.scopeType === CouponScopeType.CATEGORY) {
      if (!dto.categoryId) {
        throw new BadRequestException(
          'categoryId is required for a CATEGORY-scoped coupon',
        );
      }
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException(
          'categoryId does not reference an existing category',
        );
      }
    } else if (dto.categoryId !== undefined) {
      throw new BadRequestException(
        'categoryId must not be set for a STORE_WIDE coupon',
      );
    }
  }

  private async getCouponOrThrow(id: string): Promise<Coupon> {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    return coupon;
  }

  // ─── Checkout-time validation (POST /checkout/validate, POST /checkout/orders) ──

  /**
   * Read-only preview — no transaction, no usage claim (§2.2/§2.6). Used
   * by POST /checkout/validate. Never authoritative: the real claim only
   * happens in validateAndClaim, inside checkout()'s own transaction.
   */
  async previewDiscount(
    params: ValidateCouponParams,
  ): Promise<CouponPreviewResult> {
    const { coupon, scopedSubtotalPaise } = await this.validateCouponCore(
      this.prisma,
      params,
    );
    const { discountPaise, shippingFeePaise } = this.computeDiscount(
      coupon,
      scopedSubtotalPaise,
      params.shippingFeePaise,
    );
    return { couponCode: coupon.code, discountPaise, shippingFeePaise };
  }

  /**
   * Must run inside the caller's own transaction (same reason
   * IdempotencyService.claim does) — the usage-limit CAS below has to
   * commit/roll back atomically with the Order it's claimed for. Runs
   * every non-contention validation check first (each with its own
   * specific error message, §2.6), then the total-usage-limit atomic CAS
   * last, since that's the only check with a genuine cross-user race to
   * guard against — everything else either can't race (admin-controlled
   * state) or already rides on the checkout transaction's own cart
   * `FOR UPDATE` lock (per-user limit, first-order-only — see
   * validateCouponCore).
   */
  async validateAndClaim(
    tx: PrismaOrTx,
    params: ValidateCouponParams,
  ): Promise<CouponDiscountResult> {
    const { coupon, scopedSubtotalPaise } = await this.validateCouponCore(
      tx,
      params,
    );

    // Race-safe claim: UPDATE ... WHERE usedCount < usageLimitTotal
    // RETURNING id — not check-then-increment (§2.6, same CAS shape as
    // IdempotencyService.claim's INSERT...ON CONFLICT).
    const claimed = await tx.$queryRaw<{ id: string }[]>`
      UPDATE coupons SET "usedCount" = "usedCount" + 1
      WHERE id = ${coupon.id}
        AND ("usageLimitTotal" IS NULL OR "usedCount" < "usageLimitTotal")
      RETURNING id
    `;
    if (claimed.length === 0) {
      // Only reachable if usageLimitTotal was set — validateCouponCore
      // already re-reads usedCount fresh inside this same transaction, so
      // this is a genuine last-moment race loss (another transaction
      // claimed the final slot between that read and this UPDATE), not a
      // stale check. The whole transaction rolls back on this throw,
      // including the idempotency claim already made — a clean retry.
      throw new ConflictException(
        'This coupon just reached its usage limit — try again without it, or with a different code',
      );
    }

    const { discountPaise, shippingFeePaise } = this.computeDiscount(
      coupon,
      scopedSubtotalPaise,
      params.shippingFeePaise,
    );
    return {
      couponId: coupon.id,
      couponCode: coupon.code,
      discountPaise,
      shippingFeePaise,
    };
  }

  /**
   * Records the audit-ledger row for a successful claim — called only
   * after the Order it belongs to exists (coupon_usages.orderId is
   * NOT NULL + unique), so this is a separate step from
   * validateAndClaim, run right after `tx.order.create(...)` inside the
   * same transaction, never before it.
   */
  async recordUsage(
    tx: PrismaOrTx,
    params: {
      couponId: string;
      userId: string;
      orderId: string;
      discountAppliedAmountPaise: bigint;
    },
  ): Promise<void> {
    await tx.couponUsage.create({
      data: {
        couponId: params.couponId,
        userId: params.userId,
        orderId: params.orderId,
        discountAppliedAmount: paiseToDecimalString(
          params.discountAppliedAmountPaise,
        ),
      },
    });
  }

  /**
   * Every check except the total-usage-limit CAS — shared by both
   * previewDiscount (read-only) and validateAndClaim (which additionally
   * performs the CAS after this returns). Each failure has its own
   * specific message rather than one generic "invalid coupon," matching
   * this codebase's general preference for actionable error text over a
   * flat 400.
   */
  private async validateCouponCore(
    client: PrismaOrTx,
    params: ValidateCouponParams,
  ): Promise<{ coupon: Coupon; scopedSubtotalPaise: bigint }> {
    const normalizedCode = params.code.trim().toUpperCase();
    const coupon = await client.coupon.findUnique({
      where: { code: normalizedCode },
    });
    if (!coupon) {
      throw new BadRequestException('This coupon code is not valid');
    }
    if (!coupon.isActive) {
      throw new BadRequestException('This coupon is no longer active');
    }

    const now = new Date();
    if (coupon.startsAt && now < coupon.startsAt) {
      throw new BadRequestException('This coupon is not active yet');
    }
    if (coupon.expiresAt && now > coupon.expiresAt) {
      throw new BadRequestException('This coupon has expired');
    }

    let scopedSubtotalPaise: bigint;
    if (coupon.scopeType === CouponScopeType.CATEGORY) {
      scopedSubtotalPaise = params.lineItems
        .filter((item) => item.categoryId === coupon.categoryId)
        .reduce((sum, item) => sum + item.lineTotalPaise, 0n);
      if (scopedSubtotalPaise === 0n) {
        throw new BadRequestException(
          'This coupon does not apply to any items in your cart',
        );
      }
    } else {
      scopedSubtotalPaise = params.subtotalPaise;
    }

    if (coupon.minOrderValue !== null) {
      const minOrderValuePaise = decimalToPaise(coupon.minOrderValue);
      if (scopedSubtotalPaise < minOrderValuePaise) {
        throw new BadRequestException(
          `This coupon requires a minimum order of ${paiseToDecimalString(minOrderValuePaise)}`,
        );
      }
    }

    if (coupon.firstOrderOnly) {
      // Any status — even a cancelled or payment-failed prior order still
      // means this isn't the user's first checkout *attempt* (§2.6, the
      // conservative reading, avoids re-triggering eligibility by
      // abandoning and re-starting checkout).
      const priorOrderCount = await client.order.count({
        where: { userId: params.userId },
      });
      if (priorOrderCount > 0) {
        throw new BadRequestException(
          'This coupon is only valid on your first order',
        );
      }
    }

    if (coupon.usageLimitPerUser !== null) {
      // Not its own CAS — the checkout transaction's own
      // `SELECT cart ... FOR UPDATE` already serializes this specific
      // user's concurrent checkout attempts, so a plain COUNT read inside
      // this same transaction is race-safe for free (§2.6).
      const priorUsageCount = await client.couponUsage.count({
        where: { couponId: coupon.id, userId: params.userId },
      });
      if (priorUsageCount >= coupon.usageLimitPerUser) {
        throw new BadRequestException(
          'You have already used this coupon the maximum number of times',
        );
      }
    }

    return { coupon, scopedSubtotalPaise };
  }

  /** Never native floats — all in bigint paise via decimalToPaise, same
   * as every other price computation in this codebase (§2.4). */
  private computeDiscount(
    coupon: Coupon,
    scopedSubtotalPaise: bigint,
    shippingFeePaise: bigint,
  ): { discountPaise: bigint; shippingFeePaise: bigint } {
    switch (coupon.type) {
      case CouponType.PERCENTAGE:
        return {
          discountPaise:
            (scopedSubtotalPaise * BigInt(coupon.percentageOff ?? 0)) / 100n,
          shippingFeePaise,
        };
      case CouponType.FLAT_AMOUNT: {
        const flatPaise = decimalToPaise(
          coupon.flatAmountOff ?? new Prisma.Decimal(0),
        );
        // Never exceeds what it's discounting — otherwise total could go
        // negative (§2.4).
        return {
          discountPaise:
            flatPaise < scopedSubtotalPaise ? flatPaise : scopedSubtotalPaise,
          shippingFeePaise,
        };
      }
      case CouponType.FREE_SHIPPING:
        return { discountPaise: 0n, shippingFeePaise: 0n };
    }
  }

  private mapUniqueConstraintError(err: unknown, message: string): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }
    throw err as Error;
  }

  private toView(coupon: Coupon): CouponView {
    return {
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      percentageOff: coupon.percentageOff,
      flatAmountOff: coupon.flatAmountOff
        ? paiseToDecimalString(decimalToPaise(coupon.flatAmountOff))
        : null,
      scopeType: coupon.scopeType,
      categoryId: coupon.categoryId,
      minOrderValue: coupon.minOrderValue
        ? paiseToDecimalString(decimalToPaise(coupon.minOrderValue))
        : null,
      usageLimitTotal: coupon.usageLimitTotal,
      usageLimitPerUser: coupon.usageLimitPerUser,
      usedCount: coupon.usedCount,
      firstOrderOnly: coupon.firstOrderOnly,
      startsAt: coupon.startsAt,
      expiresAt: coupon.expiresAt,
      isActive: coupon.isActive,
      description: coupon.description,
      createdByAdminId: coupon.createdByAdminId,
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt,
    };
  }
}
