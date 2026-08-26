import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { UploadsModule } from '../uploads/uploads.module';
import { UsersModule } from '../users/users.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * Depends on: users (shipping-snapshot source at creation time), products
 * (line-item snapshot), uploads (customization file references), notifications
 * (ORDER_PAID / ORDER_STATUS_CHANGED outbox events). Does NOT depend on
 * payments or checkout — payments depends on orders, not the reverse (see
 * the corrected module dependency graph reported alongside this scaffold).
 *
 * Cancellation no longer calls Razorpay directly (§12.5 — reverted back to
 * "no in-app refund-initiation API," a scope change after an initial Phase
 * 7 pass did wire it up): it just flags a `Refund` row PENDING for manual
 * processing, so RazorpayModule isn't a dependency here anymore either —
 * see OrdersService.performCancellation's doc comment.
 */
@Module({
  imports: [UsersModule, ProductsModule, UploadsModule, NotificationsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
