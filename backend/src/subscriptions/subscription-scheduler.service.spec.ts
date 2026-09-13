jest.mock('@sentry/node');

import { Subscription } from '@prisma/client';
import { SubscriptionSchedulerService } from './subscription-scheduler.service';

/**
 * Phase 7 — Scheduler Implementation Wave. Unit tests against fully
 * mocked `PrismaService`/`SubscriptionService`/
 * `SubscriptionOrchestrationService` — same convention as
 * `payment-reconciliation.service.spec.ts` (including its own
 * `jest.mock('@sentry/node')` at the top of the file). Real-Postgres
 * proof lives in `test/e2e/subscription-scheduler.e2e-spec.ts`.
 */
describe('SubscriptionSchedulerService', () => {
  function makeSubscription(
    overrides: Partial<Subscription> = {},
  ): Subscription {
    return {
      id: 'sub-1',
      tenantId: 'tenant-a',
      planId: 'plan-a',
      status: 'PAST_DUE',
      currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
      providerCustomerId: 'fake-cust-1',
      providerSubscriptionId: 'fake-sub-1',
      cancelAtPeriodEnd: null,
      trialEndsAt: null,
      pendingPlanId: null,
      graceEndsAt: new Date('2026-01-05T00:00:00Z'),
      retentionEndsAt: null,
      updatedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  function makeDeps() {
    const prisma = {};
    const subscriptionService = {
      findGraceExhaustedSubscriptions: jest.fn().mockResolvedValue([]),
      findSubscriptionsNeedingPeriodReconciliation: jest
        .fn()
        .mockResolvedValue([]),
      findExpirableCancelledSubscriptions: jest.fn().mockResolvedValue([]),
      exhaustGrace: jest.fn().mockResolvedValue({
        applied: true,
        subscription: makeSubscription({ status: 'PAUSED' }),
        eventType: 'paused',
      }),
      expire: jest.fn().mockResolvedValue({
        applied: true,
        subscription: makeSubscription({ status: 'EXPIRED' }),
        eventType: 'expired',
      }),
    };
    const subscriptionOrchestrationService = {
      reconcilePeriod: jest.fn().mockResolvedValue({}),
    };
    return { prisma, subscriptionService, subscriptionOrchestrationService };
  }

  function makeScheduler(deps: ReturnType<typeof makeDeps>) {
    return new SubscriptionSchedulerService(
      deps.prisma as never,
      deps.subscriptionService as never,
      deps.subscriptionOrchestrationService as never,
    );
  }

  describe('runGraceExhaustion', () => {
    it('does nothing when no subscriptions are eligible', async () => {
      const deps = makeDeps();
      const scheduler = makeScheduler(deps);

      await scheduler.runGraceExhaustion();

      expect(deps.subscriptionService.exhaustGrace).not.toHaveBeenCalled();
    });

    it('calls exhaustGrace for every eligible subscription', async () => {
      const deps = makeDeps();
      const a = makeSubscription({ id: 'sub-a', tenantId: 'tenant-a' });
      const b = makeSubscription({ id: 'sub-b', tenantId: 'tenant-b' });
      deps.subscriptionService.findGraceExhaustedSubscriptions.mockResolvedValue(
        [a, b],
      );
      const scheduler = makeScheduler(deps);

      await scheduler.runGraceExhaustion();

      expect(deps.subscriptionService.exhaustGrace).toHaveBeenCalledTimes(2);
      expect(deps.subscriptionService.exhaustGrace).toHaveBeenNthCalledWith(
        1,
        deps.prisma,
        a,
        {},
      );
      expect(deps.subscriptionService.exhaustGrace).toHaveBeenNthCalledWith(
        2,
        deps.prisma,
        b,
        {},
      );
    });

    it('one subscription failing does not prevent others from being processed (failure isolation)', async () => {
      const deps = makeDeps();
      const a = makeSubscription({ id: 'sub-a' });
      const b = makeSubscription({ id: 'sub-b' });
      const c = makeSubscription({ id: 'sub-c' });
      deps.subscriptionService.findGraceExhaustedSubscriptions.mockResolvedValue(
        [a, b, c],
      );
      deps.subscriptionService.exhaustGrace
        .mockResolvedValueOnce({
          applied: true,
          subscription: a,
          eventType: 'paused',
        })
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({
          applied: true,
          subscription: c,
          eventType: 'paused',
        });
      const scheduler = makeScheduler(deps);

      await expect(scheduler.runGraceExhaustion()).resolves.not.toThrow();

      expect(deps.subscriptionService.exhaustGrace).toHaveBeenCalledTimes(3);
    });

    it('the finder itself throwing does not propagate out of the cron method', async () => {
      const deps = makeDeps();
      deps.subscriptionService.findGraceExhaustedSubscriptions.mockRejectedValue(
        new Error('db unavailable'),
      );
      const scheduler = makeScheduler(deps);

      await expect(scheduler.runGraceExhaustion()).resolves.not.toThrow();
    });

    it('a benign no-op (applied: false, e.g. a lost CAS race) is not treated as a failure', async () => {
      const deps = makeDeps();
      const a = makeSubscription({ id: 'sub-a' });
      deps.subscriptionService.findGraceExhaustedSubscriptions.mockResolvedValue(
        [a],
      );
      deps.subscriptionService.exhaustGrace.mockResolvedValue({
        applied: false,
        subscription: a,
        eventType: null,
      });
      const scheduler = makeScheduler(deps);

      await expect(scheduler.runGraceExhaustion()).resolves.not.toThrow();
      expect(deps.subscriptionService.exhaustGrace).toHaveBeenCalledTimes(1);
    });
  });

  describe('runPeriodReconciliation', () => {
    it('does nothing when no subscriptions are eligible', async () => {
      const deps = makeDeps();
      const scheduler = makeScheduler(deps);

      await scheduler.runPeriodReconciliation();

      expect(
        deps.subscriptionOrchestrationService.reconcilePeriod,
      ).not.toHaveBeenCalled();
    });

    it("calls reconcilePeriod with each eligible subscription's tenantId", async () => {
      const deps = makeDeps();
      const a = makeSubscription({
        id: 'sub-a',
        tenantId: 'tenant-a',
        status: 'ACTIVE',
      });
      const b = makeSubscription({
        id: 'sub-b',
        tenantId: 'tenant-b',
        status: 'ACTIVE',
      });
      deps.subscriptionService.findSubscriptionsNeedingPeriodReconciliation.mockResolvedValue(
        [a, b],
      );
      const scheduler = makeScheduler(deps);

      await scheduler.runPeriodReconciliation();

      expect(
        deps.subscriptionOrchestrationService.reconcilePeriod,
      ).toHaveBeenCalledTimes(2);
      expect(
        deps.subscriptionOrchestrationService.reconcilePeriod,
      ).toHaveBeenNthCalledWith(1, 'tenant-a');
      expect(
        deps.subscriptionOrchestrationService.reconcilePeriod,
      ).toHaveBeenNthCalledWith(2, 'tenant-b');
    });

    it('one subscription failing does not prevent others from being reconciled (failure isolation)', async () => {
      const deps = makeDeps();
      const a = makeSubscription({ id: 'sub-a', status: 'ACTIVE' });
      const b = makeSubscription({ id: 'sub-b', status: 'ACTIVE' });
      deps.subscriptionService.findSubscriptionsNeedingPeriodReconciliation.mockResolvedValue(
        [a, b],
      );
      deps.subscriptionOrchestrationService.reconcilePeriod
        .mockRejectedValueOnce(new Error('provider unavailable'))
        .mockResolvedValueOnce({});
      const scheduler = makeScheduler(deps);

      await expect(scheduler.runPeriodReconciliation()).resolves.not.toThrow();

      expect(
        deps.subscriptionOrchestrationService.reconcilePeriod,
      ).toHaveBeenCalledTimes(2);
    });

    it('the finder itself throwing does not propagate out of the cron method', async () => {
      const deps = makeDeps();
      deps.subscriptionService.findSubscriptionsNeedingPeriodReconciliation.mockRejectedValue(
        new Error('db unavailable'),
      );
      const scheduler = makeScheduler(deps);

      await expect(scheduler.runPeriodReconciliation()).resolves.not.toThrow();
    });
  });

  describe('runCancellationExpiration (Cancellation Retention + Unscheduling wave, P7-D3 Part D)', () => {
    it('does nothing when no subscriptions are eligible', async () => {
      const deps = makeDeps();
      const scheduler = makeScheduler(deps);

      await scheduler.runCancellationExpiration();

      expect(deps.subscriptionService.expire).not.toHaveBeenCalled();
    });

    it('calls expire for every eligible CANCELLED subscription', async () => {
      const deps = makeDeps();
      const a = makeSubscription({
        id: 'sub-a',
        tenantId: 'tenant-a',
        status: 'CANCELLED',
      });
      const b = makeSubscription({
        id: 'sub-b',
        tenantId: 'tenant-b',
        status: 'CANCELLED',
      });
      deps.subscriptionService.findExpirableCancelledSubscriptions.mockResolvedValue(
        [a, b],
      );
      const scheduler = makeScheduler(deps);

      await scheduler.runCancellationExpiration();

      expect(deps.subscriptionService.expire).toHaveBeenCalledTimes(2);
      expect(deps.subscriptionService.expire).toHaveBeenNthCalledWith(
        1,
        deps.prisma,
        a,
        {},
      );
      expect(deps.subscriptionService.expire).toHaveBeenNthCalledWith(
        2,
        deps.prisma,
        b,
        {},
      );
    });

    it('one subscription failing does not prevent others from being processed (failure isolation)', async () => {
      const deps = makeDeps();
      const a = makeSubscription({ id: 'sub-a', status: 'CANCELLED' });
      const b = makeSubscription({ id: 'sub-b', status: 'CANCELLED' });
      const c = makeSubscription({ id: 'sub-c', status: 'CANCELLED' });
      deps.subscriptionService.findExpirableCancelledSubscriptions.mockResolvedValue(
        [a, b, c],
      );
      deps.subscriptionService.expire
        .mockResolvedValueOnce({
          applied: true,
          subscription: a,
          eventType: 'expired',
        })
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({
          applied: true,
          subscription: c,
          eventType: 'expired',
        });
      const scheduler = makeScheduler(deps);

      await expect(
        scheduler.runCancellationExpiration(),
      ).resolves.not.toThrow();

      expect(deps.subscriptionService.expire).toHaveBeenCalledTimes(3);
    });

    it('the finder itself throwing does not propagate out of the cron method', async () => {
      const deps = makeDeps();
      deps.subscriptionService.findExpirableCancelledSubscriptions.mockRejectedValue(
        new Error('db unavailable'),
      );
      const scheduler = makeScheduler(deps);

      await expect(
        scheduler.runCancellationExpiration(),
      ).resolves.not.toThrow();
    });

    it('an already-expired subscription (applied: false) is not treated as a failure and is not reprocessed on a repeat run', async () => {
      const deps = makeDeps();
      const a = makeSubscription({ id: 'sub-a', status: 'CANCELLED' });
      deps.subscriptionService.findExpirableCancelledSubscriptions.mockResolvedValueOnce(
        [a],
      );
      const scheduler = makeScheduler(deps);

      await scheduler.runCancellationExpiration();
      expect(deps.subscriptionService.expire).toHaveBeenCalledTimes(1);

      // Second run: the finder itself is responsible for no longer
      // returning an already-EXPIRED row (status: 'CANCELLED' filter) —
      // simulated here by returning an empty set, exactly as the real
      // finder would once the row is no longer CANCELLED.
      deps.subscriptionService.findExpirableCancelledSubscriptions.mockResolvedValueOnce(
        [],
      );
      await scheduler.runCancellationExpiration();
      expect(deps.subscriptionService.expire).toHaveBeenCalledTimes(1);
    });
  });

  describe('repeated execution (idempotency)', () => {
    it("running the same job twice with an unchanged eligible set calls the domain method again, safely (idempotency is the domain method's own contract, not the scheduler's)", async () => {
      const deps = makeDeps();
      const a = makeSubscription({ id: 'sub-a' });
      deps.subscriptionService.findGraceExhaustedSubscriptions.mockResolvedValue(
        [a],
      );
      const scheduler = makeScheduler(deps);

      await scheduler.runGraceExhaustion();
      await scheduler.runGraceExhaustion();

      expect(deps.subscriptionService.exhaustGrace).toHaveBeenCalledTimes(2);
      // Both calls are safe — exhaustGrace's own CAS/same-state contract
      // (proven in subscription.service.spec.ts) is what makes a second
      // call a no-op in reality; this test only proves the scheduler
      // itself never special-cases "already ran" bookkeeping of its own.
    });
  });
});
