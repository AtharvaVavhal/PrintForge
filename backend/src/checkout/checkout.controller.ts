import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { IDEMPOTENCY_KEY_HEADER } from '../common/constants/app.constants';
import { CheckoutService } from './checkout.service';
import { CreateOrderDto } from './dto/create-order.dto';

/**
 * Owns (§20): `POST /checkout/orders` (Auth, **required**
 * Idempotency-Key header) — converts the current user's cart into an
 * Order. §20 also lists `POST /checkout/validate` (read-only pre-check)
 * and `POST /checkout/orders/:id/retry-payment` (reuses an existing
 * razorpayOrderId); neither is implemented here — validate wasn't in this
 * phase's scope, and retry-payment needs a real Razorpay call, which is
 * explicitly Phase 6's job.
 */
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('orders')
  async createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new BadRequestException(
        `${IDEMPOTENCY_KEY_HEADER} header is required`,
      );
    }
    const { view, created } = await this.checkoutService.checkout(
      user.id,
      dto,
      idempotencyKey,
    );
    // 201 on genuine creation, 200 on an idempotent replay of an existing
    // key — same body either way (§20 "return the same result").
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return view;
  }
}
