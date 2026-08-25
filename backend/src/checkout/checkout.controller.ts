import { Controller } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

/**
 * Owns (§20): POST /checkout/validate (Auth, read-only), POST
 * /checkout/orders (Auth, **required** Idempotency-Key header),
 * POST /checkout/orders/:id/retry-payment (Auth, owner — reuses existing
 * razorpayOrderId if set).
 *
 * TODO(checkout): implement.
 */
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}
}
