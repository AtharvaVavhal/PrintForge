import { Module } from '@nestjs/common';
import { EmailService } from './email/email.service';
import { NotificationsService } from './notifications.service';
import { OutboxPoller } from './outbox/outbox.poller';

/**
 * Base-layer domain module — consumed by orders/auth, depends on neither
 * (see the corrected module dependency graph reported alongside this
 * scaffold). PostgreSQL-backed transactional outbox, no Redis/Kafka/queue —
 * see BLUEPRINT-v1.2.md §12 and §17. EmailService (Phase 7) is internal to
 * this module — only OutboxPoller calls it, never a request handler
 * directly (§17: email must never sit inline inside a state-changing
 * transaction).
 */
@Module({
  // OutboxPoller's @Cron is discovered by the single schedule-module
  // registration in AppModule — a second one here double-runs every job.
  providers: [NotificationsService, OutboxPoller, EmailService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
