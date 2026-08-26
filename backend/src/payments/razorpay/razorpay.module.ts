import { Module } from '@nestjs/common';
import { RazorpayService } from './razorpay.service';

/**
 * Extracted into its own leaf module (Phase 7) so both `payments/` and
 * `orders/` can depend on it without creating a module cycle: `payments`
 * already depends on `orders` (§17, one-directional by design), and Phase
 * 7's order-cancellation refund trigger means `orders` now also needs the
 * Razorpay client. RazorpayService itself only wraps the SDK + config — no
 * coupling to Prisma/Orders/Payments business logic — so it's a clean leaf:
 * `orders` and `payments` both import `RazorpayModule` directly, neither
 * imports the other's domain module for this, no `forwardRef()` needed.
 */
@Module({
  providers: [RazorpayService],
  exports: [RazorpayService],
})
export class RazorpayModule {}
