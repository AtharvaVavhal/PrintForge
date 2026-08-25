import { Injectable } from '@nestjs/common';
import { OutboxEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';

export interface OutboxEventInput {
  eventType: OutboxEventType;
  aggregateType: string;
  aggregateId: string;
  eventKey: string;
  payload: Prisma.InputJsonValue;
}

/**
 * Outbox INSERT helper, called by orders/auth from inside their own DB
 * transaction (never a separate transaction — see §13). This service must
 * never itself decide business state; it only records that an event
 * happened. `eventKey` uniqueness is the dedup backstop (§12.2) — a
 * conflict here means the caller already inserted this exact event and is
 * treated as a harmless no-op by the caller's own conflict handling, not by
 * this helper.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueOutboxEvent(
    tx: Prisma.TransactionClient,
    event: OutboxEventInput,
  ): Promise<void> {
    await tx.outboxEvent.create({ data: event });
  }
}
