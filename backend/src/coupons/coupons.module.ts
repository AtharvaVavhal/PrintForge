import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';

/**
 * Base-layer module, same tier as users/notifications/uploads — no
 * cross-module import (PHASE-10-PROPOSAL.md §2.3). The one thing that
 * looked like it might need ProductsModule — validating that a
 * CATEGORY-scope coupon's categoryId actually exists — is a flat query
 * against `categories` directly via the shared PrismaService (confirmed
 * against admin.service.ts's identical direct-query pattern for
 * User/Order), not a call into ProductsService's business logic.
 *
 * No controller: every coupon route is admin-only (GET/POST/PATCH
 * /admin/coupons[/:id]) and lives in AdminController, same pattern as
 * order-status transitions and review moderation — delegating to
 * CouponsService, imported here by AdminModule. CheckoutModule also
 * imports this module so CheckoutService can call
 * CouponsService.validateAndClaim/previewDiscount.
 */
@Module({
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
