import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

/**
 * Owns (§20): POST /payments/verify (Auth, owner, CAS-idempotent),
 * POST /payments/webhook (Signed — Razorpay signature, not JWT).
 * payment_attempts is never a standalone resource — nested only inside
 * order responses (§20, not implemented in this phase — Order reads are
 * Phase 7's GET /orders/:id).
 */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('verify')
  async verify(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.paymentsService.verifyPayment(user.id, dto);
  }

  /**
   * Webhook secret is dashboard-configured at
   * `{BACKEND_URL}/api/v1/payments/webhook` — point the Razorpay dashboard
   * webhook here once RAZORPAY_WEBHOOK_SECRET is set.
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
  ): Promise<{ received: true }> {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Missing webhook body or signature');
    }
    await this.paymentsService.receiveWebhook(
      req.rawBody.toString('utf8'),
      signature,
      eventId,
    );
    return { received: true };
  }
}
