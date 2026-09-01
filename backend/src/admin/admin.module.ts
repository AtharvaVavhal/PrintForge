import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { CouponsModule } from '../coupons/coupons.module';
import { AppSettingModule } from '../app-setting/app-setting.module';
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
 */
@Module({
  imports: [
    OrdersModule,
    ProductsModule,
    UsersModule,
    ReviewsModule,
    CouponsModule,
    AppSettingModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
