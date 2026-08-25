import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';
import { OutboxPoller } from './outbox/outbox.poller';

/**
 * Base-layer domain module — consumed by orders/auth, depends on neither
 * (see the corrected module dependency graph reported alongside this
 * scaffold). PostgreSQL-backed transactional outbox, no Redis/Kafka/queue —
 * see BLUEPRINT-v1.2.md §12 and §17.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [NotificationsService, OutboxPoller],
  exports: [NotificationsService],
})
export class NotificationsModule {}
