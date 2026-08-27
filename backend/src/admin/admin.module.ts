import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * Pure aggregation layer (§17) — may depend on multiple domain modules.
 * Does not itself own business logic beyond dashboard aggregation and
 * customer listing; product/order CRUD delegates to ProductsService /
 * OrdersService. Review moderation (PATCH /admin/reviews/:id/status)
 * delegates to ReviewsService the same way — additive import, same role
 * `ReviewsModule` already plays for the customer-facing review routes
 * (PHASE-10-PROPOSAL.md §1.2/§1.3).
 */
@Module({
  imports: [OrdersModule, ProductsModule, UsersModule, ReviewsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
