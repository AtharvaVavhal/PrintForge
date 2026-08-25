import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

/**
 * Outbox INSERT helper, called by orders/auth from inside their own DB
 * transaction (never a separate transaction — see §13). This service must
 * never itself decide business state; it only records that an event
 * happened.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(notifications): enqueueOutboxEvent(tx, type, payload) for the three
  // frozen event types — ORDER_PAID, ORDER_STATUS_CHANGED,
  // PASSWORD_RESET_REQUESTED. Must accept a Prisma transaction client so the
  // INSERT participates in the caller's transaction.
}
