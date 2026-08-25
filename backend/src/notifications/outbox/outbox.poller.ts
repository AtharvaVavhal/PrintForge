import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/database/prisma.service';

/**
 * Independent @nestjs/schedule poller — the ONLY writer that processes
 * outbox_events. Its only writes are to outbox_events itself; email failure
 * is architecturally incapable of reverting order/payment state (§17).
 *
 * TODO(notifications): implement polling query (status=PENDING, oldest
 * first, row-locked), Resend send call, retry/backoff constants (§37).
 */
@Injectable()
export class OutboxPoller {
  private readonly logger = new Logger(OutboxPoller.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingEvents(): Promise<void> {
    // TODO(notifications): implement.
  }
}
