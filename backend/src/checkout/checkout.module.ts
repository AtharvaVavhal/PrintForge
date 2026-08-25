import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { IdempotencyService } from './idempotency/idempotency.service';
import { PricingService } from './pricing/pricing.service';

/**
 * Depends on: cart, products, users, orders, payments. checkout -> payments
 * (never the reverse) — the checkout transaction creates the Order, then
 * calls into payments to create the Razorpay order (§12.4). This direction
 * was corrected from the literal turn-6 restatement; see the corrected
 * module dependency graph reported alongside this scaffold.
 */
@Module({
  imports: [
    CartModule,
    ProductsModule,
    UsersModule,
    OrdersModule,
    PaymentsModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService, PricingService, IdempotencyService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
