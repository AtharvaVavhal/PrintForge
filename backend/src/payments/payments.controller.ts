import { Controller } from '@nestjs/common';
import { PaymentsService } from './payments.service';

/**
 * Owns (§20): POST /payments/verify (Auth, owner, CAS-idempotent),
 * POST /payments/webhook (Signed — Razorpay signature, not JWT).
 * payment_attempts is never a standalone resource — nested only inside
 * order responses (§20).
 *
 * TODO(payments): implement.
 */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}
}
