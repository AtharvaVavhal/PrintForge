import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { CouponsModule } from '../coupons/coupons.module';
import { AppSettingModule } from '../app-setting/app-setting.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { EntitlementModule } from '../entitlements/entitlement.module';
import { UsageModule } from '../usage/usage.module';
import { SubscriptionModule } from '../subscriptions/subscription.module';
import { RefundsModule } from '../payments/refunds/refunds.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * Pure aggregation layer (§17) — may depend on multiple domain modules.
 * Does not itself own business logic beyond dashboard aggregation and
 * customer listing; product/order CRUD delegates to ProductsService /
 * OrdersService. Review moderation (PATCH /admin/reviews/:id/status)
 * delegates to ReviewsService the same way — additive import, same role
 * `ReviewsModule` already plays for the customer-facing review routes
 * (PHASE-10-PROPOSAL.md §1.2/§1.3). Coupon CRUD (GET/POST/PATCH
 * /admin/coupons[/:id]) delegates to CouponsService the same way again —
 * CouponsModule has no controller of its own (every coupon route is
 * admin-only), so this import is the only way any coupon HTTP surface
 * exists at all (§2.3).
 *
 * Phase 6 W6 — `EntitlementModule`/`UsageModule` imported for
 * GET /admin/subscription|usage|entitlements, exactly as each module's own
 * doc comment already anticipated ("W6 ... will import this module into
 * AdminModule the same way AdminModule already imports CouponsModule/
 * ReviewsModule/etc."). `AdminService` composes `EntitlementService.
 * resolve()`/`UsageService.getUsage()` — it does not reimplement either.
 *
 * Phase 7 Stage 2 (docs/saas/DECISIONS.md P7-D2) — `SubscriptionModule`
 * imported for the four new mutation routes (`POST
 * /admin/subscription/upgrade|downgrade|cancel|resume`), delegating to
 * `SubscriptionOrchestrationService` the same way order/review/coupon
 * mutation already delegates to their own domain services from this
 * controller — `AdminController` does not reimplement any orchestration
 * logic itself. This is also the first module import that brings
 * `SubscriptionModule` into the running `app.module.ts` graph at all
 * (Stage 1 never needed to — see that module's own comment).
 *
 * Phase 8 (P8-11) - `RefundsModule` imported for `POST /admin/payment-
 * attempts/:id/refund`, delegating to `RefundsService` the same way
 * every other mutation route already delegates to its own domain
 * service - reuses the existing `orders:transition` permission (no new
 * permission), no new authorization mechanism.
 */
@Module({
  imports: [
    OrdersModule,
    ProductsModule,
    UsersModule,
    ReviewsModule,
    CouponsModule,
    AppSettingModule,
    InvoicesModule,
    EntitlementModule,
    UsageModule,
    SubscriptionModule,
    RefundsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
