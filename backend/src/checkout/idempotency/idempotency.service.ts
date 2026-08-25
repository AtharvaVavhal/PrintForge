import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

/**
 * Backs the required Idempotency-Key header on POST /checkout/orders
 * against the idempotency_keys table (internal-only, no REST surface — §20).
 *
 * TODO(checkout): implement check-and-record against idempotency_keys.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}
}
