import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CouponsModule } from '../coupons/coupons.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { IdempotencyService } from './idempotency/idempotency.service';
import { PricingService } from './pricing/pricing.service';
import { TaxService } from './tax/tax.service';

/**
 * Depends on: cart, products, users, orders, payments. checkout -> payments
 * (never the reverse) — the checkout transaction creates the Order, then
 * calls into payments to create the Razorpay order (§12.4). This direction
 * was corrected from the literal turn-6 restatement; see the corrected
 * module dependency graph reported alongside this scaffold. Also depends
 * on coupons (Phase 10, PHASE-10-PROPOSAL.md §2.3) — CheckoutService calls
 * CouponsService.validateAndClaim inside its own order-creation
 * transaction, and CouponsService.previewDiscount for POST
 * /checkout/validate.
 */
@Module({
  imports: [
    CartModule,
    ProductsModule,
    UsersModule,
    OrdersModule,
    PaymentsModule,
    CouponsModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService, PricingService, IdempotencyService, TaxService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
