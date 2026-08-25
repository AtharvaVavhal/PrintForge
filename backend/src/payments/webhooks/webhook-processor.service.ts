import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/database/prisma.service';

/**
 * Two-phase webhook processing (§12): Phase 1 (controller) verifies the
 * signature and persists the raw event to webhook_events for a fast ack.
 * This poller runs Phase 2 — transactional processing with poller-driven
 * retry on failure. webhook_events.status: RECEIVED / PROCESSED /
 * PROCESSING_FAILED / IGNORED. Unique event ID enforces idempotency.
 *
 * TODO(payments): implement Phase 2 processing + retry/backoff (§37).
 */
@Injectable()
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processReceivedWebhooks(): Promise<void> {
    // TODO(payments): implement.
  }
}
