import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { Subscription } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionOrchestrationService } from './subscription-orchestration.service';

/** Same bounded-batch discipline `PaymentReconciliationService.BATCH_SIZE`
 * already established — never process an unbounded set in one run. */
const BATCH_SIZE = 20;

/**
 * Phase 7 — Scheduler Implementation Wave (readiness-audit-approved: the
 * three IMPLEMENTATION GAP items whose callable domain methods already
 * exist and require no new decision). Uses `@nestjs/schedule`'s `@Cron`
 * — already a dependency (`^5.0.1`), already registered via
 * `ScheduleModule.forRoot()` in `app.module.ts`, already the established
 * pattern for every periodic job in this codebase
 * (`WebhookProcessor`/`PaymentReconciliationService`/`OutboxPoller`). No
 * new package, no Redis, no queue, no worker, no external scheduler
 * service — this is the simplest mechanism the current architecture
 * already supports.
 *
 * Owns exactly three jobs:
 *
 *   1. `runGraceExhaustion` — `PAST_DUE` + `graceEndsAt` elapsed ->
 *      `SubscriptionService.exhaustGrace()` (-> `PAUSED`).
 *   2. `runPeriodReconciliation` — `ACTIVE`, provider-linked, past its
 *      locally-known `currentPeriodEnd` ->
 *      `SubscriptionOrchestrationService.reconcilePeriod()` (applies a
 *      pending downgrade and/or a scheduled cancellation at the
 *      provider-confirmed boundary; a plain renewal with nothing pending
 *      remains a documented, disclosed no-op — see that method's own
 *      comment).
 *   3. `runCancellationExpiration` — `CANCELLED` + `retentionEndsAt`
 *      elapsed -> `SubscriptionService.expire()` (-> `EXPIRED`). Added in
 *      the Phase 7 Cancellation Retention + Unscheduling wave
 *      (docs/saas/DECISIONS.md P7-D3 Part D), once `retentionEndsAt`
 *      existed as a persisted, authoritative field — this job was
 *      deliberately NOT built earlier (the original Scheduler
 *      Implementation Wave's own readiness audit explicitly stopped short
 *      of it for exactly that reason).
 *
 * This class never mutates `Subscription`/writes a `SubscriptionEvent`
 * itself — it only selects eligible rows (via `SubscriptionService`'s own
 * scheduler-facing finder methods, never a raw `this.prisma.subscription`
 * call — see `tenant-data-access-guard.spec.ts`) and calls the existing,
 * already-CAS-disciplined domain methods. No tenant identifier is ever
 * accepted from outside this class — eligibility is derived entirely from
 * what Postgres itself reports, never from any external/caller input, so
 * there is nothing here to "trust" or fail to trust.
 *
 * Idempotent by construction, not by any explicit tracking flag: both
 * `exhaustGrace()` and `reconcilePeriod()` are themselves safe to call
 * repeatedly (same-state/no-op contracts already proven at the unit and
 * e2e level in Stage 1/Stage 2) — a subscription that a previous run
 * already advanced simply stops matching its own eligibility query on the
 * next run (e.g. once `PAUSED`, it no longer matches `status: 'PAST_DUE'`).
 *
 * Failure isolation: each eligible row is processed inside its own
 * `try/catch` (mirroring `PaymentReconciliationService.reconcileOne()`'s
 * own per-order `.catch()`) — one subscription's failure is logged (and
 * reported to Sentry, matching that same precedent) but never aborts the
 * batch; an unexpected error before/between rows is caught by an outer
 * `try/catch` per cron method so the job itself never crashes the
 * scheduler.
 */
@Injectable()
export class SubscriptionSchedulerService {
  private readonly logger = new Logger(SubscriptionSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly subscriptionOrchestrationService: SubscriptionOrchestrationService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runGraceExhaustion(): Promise<void> {
    try {
      const eligible =
        await this.subscriptionService.findGraceExhaustedSubscriptions(
          this.prisma,
          new Date(),
          BATCH_SIZE,
        );
      if (eligible.length === 0) {
        return;
      }
      this.logger.log(
        `Grace exhaustion: ${eligible.length} PAST_DUE subscription(s) past graceEndsAt`,
      );
      for (const subscription of eligible) {
        await this.exhaustOne(subscription);
      }
    } catch (err) {
      this.logger.error(
        'Grace-exhaustion cron failed',
        err instanceof Error ? err.stack : err,
      );
      Sentry.captureException(
        err instanceof Error ? err : new Error(String(err)),
        {
          tags: { area: 'subscription_grace_exhaustion_cron' },
        },
      );
    }
  }

  private async exhaustOne(subscription: Subscription): Promise<void> {
    try {
      const result = await this.subscriptionService.exhaustGrace(
        this.prisma,
        subscription,
        {},
      );
      if (result.applied) {
        this.logger.log(
          `Grace exhausted: subscription ${subscription.id} (tenant ${subscription.tenantId}) PAST_DUE -> PAUSED`,
        );
      }
      // result.applied === false is a benign, expected no-op (a lost CAS
      // race, or a concurrent request already moved it) — not logged as
      // an error.
    } catch (err) {
      this.logger.error(
        `Grace exhaustion failed for subscription ${subscription.id}`,
        err instanceof Error ? err.stack : err,
      );
      Sentry.captureException(
        err instanceof Error ? err : new Error(String(err)),
        {
          level: 'error',
          tags: { area: 'subscription_grace_exhaustion' },
          extra: {
            subscriptionId: subscription.id,
            tenantId: subscription.tenantId,
          },
        },
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runPeriodReconciliation(): Promise<void> {
    try {
      const eligible =
        await this.subscriptionService.findSubscriptionsNeedingPeriodReconciliation(
          this.prisma,
          new Date(),
          BATCH_SIZE,
        );
      if (eligible.length === 0) {
        return;
      }
      this.logger.log(
        `Period reconciliation: ${eligible.length} ACTIVE subscription(s) past their locally-known currentPeriodEnd`,
      );
      for (const subscription of eligible) {
        await this.reconcileOne(subscription);
      }
    } catch (err) {
      this.logger.error(
        'Period-reconciliation cron failed',
        err instanceof Error ? err.stack : err,
      );
      Sentry.captureException(
        err instanceof Error ? err : new Error(String(err)),
        {
          tags: { area: 'subscription_period_reconciliation_cron' },
        },
      );
    }
  }

  private async reconcileOne(subscription: Subscription): Promise<void> {
    try {
      await this.subscriptionOrchestrationService.reconcilePeriod(
        subscription.tenantId,
      );
    } catch (err) {
      // Never leak the raw provider error/credentials here — Sentry gets
      // the exception object for diagnosis; the log line stays generic,
      // matching classifyProviderError()'s own "never surface raw
      // provider details" discipline.
      this.logger.error(
        `Period reconciliation failed for subscription ${subscription.id}`,
        err instanceof Error ? err.stack : err,
      );
      Sentry.captureException(
        err instanceof Error ? err : new Error(String(err)),
        {
          level: 'error',
          tags: { area: 'subscription_period_reconciliation' },
          extra: {
            subscriptionId: subscription.id,
            tenantId: subscription.tenantId,
          },
        },
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runCancellationExpiration(): Promise<void> {
    try {
      const eligible =
        await this.subscriptionService.findExpirableCancelledSubscriptions(
          this.prisma,
          new Date(),
          BATCH_SIZE,
        );
      if (eligible.length === 0) {
        return;
      }
      this.logger.log(
        `Cancellation expiration: ${eligible.length} CANCELLED subscription(s) past retentionEndsAt`,
      );
      for (const subscription of eligible) {
        await this.expireOne(subscription);
      }
    } catch (err) {
      this.logger.error(
        'Cancellation-expiration cron failed',
        err instanceof Error ? err.stack : err,
      );
      Sentry.captureException(
        err instanceof Error ? err : new Error(String(err)),
        {
          tags: { area: 'subscription_cancellation_expiration_cron' },
        },
      );
    }
  }

  private async expireOne(subscription: Subscription): Promise<void> {
    try {
      const result = await this.subscriptionService.expire(
        this.prisma,
        subscription,
        {},
      );
      if (result.applied) {
        this.logger.log(
          `Cancellation expired: subscription ${subscription.id} (tenant ${subscription.tenantId}) CANCELLED -> EXPIRED`,
        );
      }
      // result.applied === false is a benign, expected no-op (a lost CAS
      // race, or a concurrent request already moved it) — not logged as
      // an error. No tenant/store/order/user data is ever touched by
      // this call — expire() only ever writes Subscription/SubscriptionEvent.
    } catch (err) {
      this.logger.error(
        `Cancellation expiration failed for subscription ${subscription.id}`,
        err instanceof Error ? err.stack : err,
      );
      Sentry.captureException(
        err instanceof Error ? err : new Error(String(err)),
        {
          level: 'error',
          tags: { area: 'subscription_cancellation_expiration' },
          extra: {
            subscriptionId: subscription.id,
            tenantId: subscription.tenantId,
          },
        },
      );
    }
  }
}
