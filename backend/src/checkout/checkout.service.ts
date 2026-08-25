import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

@Injectable()
export class CheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(checkout): idempotency-keyed, row-locked order creation
  // transaction (§13), immediately followed by a call into
  // PaymentsService to create the Razorpay order.
}
