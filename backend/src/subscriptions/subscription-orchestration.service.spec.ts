import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Subscription } from '@prisma/client';
import { SubscriptionOrchestrationService } from './subscription-orchestration.service';
import {
  BillingProviderRejectedError,
  BillingProviderTimeoutError,
} from './billing-provider.errors';

/**
 * Phase 7 Stage 2 (docs/saas/DECISIONS.md P7-D2). Unit tests against fully
 * mocked `PrismaService`/`SubscriptionService`/`IdempotencyService`/
 * `BillingProvider` — same convention as `subscription.service.spec.ts`.
 * Real-Postgres + real-HTTP proof lives in
 * `test/e2e/subscription-operations.e2e-spec.ts`; `FakeBillingProvider`-
 * driven integration proof lives alongside it.
 */
describe('SubscriptionOrchestrationService', () => {
  const TENANT_ID = 'tenant-a';
  const USER_ID = 'user-a';
  const SUB_ID = 'sub-1';
  const PLAN_A = 'plan-a';
  const PLAN_B = 'plan-b';
  const PROVIDER_SUB_ID = 'fake-sub-1';
  const IDEMPOTENCY_KEY = 'idem-key-1';

  function makeSubscription(
    overrides: Partial<Subscription> = {},
  ): Subscription {
    return {
      id: SUB_ID,
      tenantId: TENANT_ID,
      planId: PLAN_A,
      status: 'ACTIVE',
      currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
      providerCustomerId: 'fake-cust-1',
      providerSubscriptionId: PROVIDER_SUB_ID,
      cancelAtPeriodEnd: null,
      trialEndsAt: null,
      pendingPlanId: null,
      graceEndsAt: null,
      retentionEndsAt: null,
      updatedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  function makeDeps(callOrder: string[] = []) {
    const prisma = {
      subscription: { findUnique: jest.fn() },
      plan: {
        findUnique: jest.fn().mockResolvedValue({ id: PLAN_B }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ key: 'plan-b-key', name: 'Plan B' }),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb({})),
    };

    const subscriptionService = {
      getSubscriptionForTenant: jest.fn().mockResolvedValue(makeSubscription()),
      findSubscriptionForTenant: jest.fn().mockResolvedValue(null),
      createPendingSubscription: jest.fn(),
      confirmActivation: jest.fn().mockImplementation(() => {
        callOrder.push('confirmActivation');
        return Promise.resolve({
          applied: true,
          subscription: makeSubscription({ status: 'ACTIVE' }),
          eventType: 'activated',
        });
      }),
      confirmUpgrade: jest.fn().mockImplementation(() => {
        callOrder.push('confirmUpgrade');
        return Promise.resolve({
          applied: true,
          subscription: makeSubscription({ planId: PLAN_B }),
          eventType: 'upgraded',
        });
      }),
      scheduleDowngrade: jest.fn().mockImplementation(() => {
        callOrder.push('scheduleDowngrade');
        return Promise.resolve({
          applied: true,
          subscription: makeSubscription({ pendingPlanId: PLAN_B }),
          eventType: 'downgrade_scheduled',
        });
      }),
      applyScheduledDowngrade: jest.fn(),
      cancel: jest.fn().mockImplementation(() => {
        callOrder.push('cancel');
        return Promise.resolve({
          applied: true,
          subscription: makeSubscription({ status: 'CANCELLED' }),
          eventType: 'cancelled',
        });
      }),
      scheduleCancellation: jest.fn().mockImplementation(() => {
        callOrder.push('scheduleCancellation');
        return Promise.resolve({
          applied: true,
          subscription: makeSubscription({ cancelAtPeriodEnd: true }),
          eventType: 'cancelled', // reused type, disambiguated by metadata — see subscription.service.ts
        });
      }),
      unscheduleCancellation: jest.fn().mockImplementation(() => {
        callOrder.push('unscheduleCancellation');
        return Promise.resolve({
          applied: true,
          subscription: makeSubscription({ cancelAtPeriodEnd: false }),
          eventType: 'cancelled', // reused type, disambiguated by metadata
        });
      }),
      recoverPayment: jest.fn().mockResolvedValue({
        applied: true,
        subscription: makeSubscription({ status: 'ACTIVE' }),
        eventType: 'resumed',
      }),
      reactivate: jest.fn().mockResolvedValue({
        applied: true,
        subscription: makeSubscription({ status: 'ACTIVE' }),
        eventType: 'reactivated',
      }),
      confirmRenewal: jest.fn().mockImplementation(() => {
        callOrder.push('confirmRenewal');
        return Promise.resolve({
          applied: true,
          subscription: makeSubscription({
            currentPeriodStart: new Date('2026-02-01T00:00:00Z'),
            currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
          }),
          eventType: 'activated',
        });
      }),
    };

    const idempotencyService = {
      findExisting: jest.fn().mockResolvedValue(null),
      claim: jest.fn().mockResolvedValue({ id: 'claim-1' }),
    };

    const billingProvider = {
      createCustomer: jest.fn(),
      createSubscription: jest.fn(),
      changeSubscription: jest.fn().mockImplementation(() => {
        callOrder.push('provider.changeSubscription');
        return Promise.resolve({
          providerSubscriptionId: PROVIDER_SUB_ID,
          currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
          currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
          planRef: PLAN_B,
        });
      }),
      cancelSubscription: jest.fn().mockResolvedValue(undefined),
      unscheduleCancellation: jest.fn().mockResolvedValue({
        providerSubscriptionId: PROVIDER_SUB_ID,
        currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
      }),
      resumeSubscription: jest.fn().mockResolvedValue({
        providerSubscriptionId: PROVIDER_SUB_ID,
        currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
      }),
      getSubscription: jest.fn(),
      verifyWebhook: jest.fn(),
      parseWebhook: jest.fn(),
    };

    return { prisma, subscriptionService, idempotencyService, billingProvider };
  }

  function makeService(deps: ReturnType<typeof makeDeps>) {
    return new SubscriptionOrchestrationService(
      deps.prisma as never,
      deps.subscriptionService as never,
      deps.idempotencyService as never,
      deps.billingProvider,
    );
  }

  describe('upgrade — call order and confirmation boundary', () => {
    it('calls the provider BEFORE SubscriptionService.confirmUpgrade', async () => {
      const callOrder: string[] = [];
      const deps = makeDeps(callOrder);
      const service = makeService(deps);

      await service.upgrade(
        TENANT_ID,
        USER_ID,
        { toPlanId: PLAN_B },
        IDEMPOTENCY_KEY,
      );

      expect(callOrder).toEqual([
        'provider.changeSubscription',
        'confirmUpgrade',
      ]);
    });

    it('provider rejection causes no local mutation and surfaces a ConflictException', async () => {
      const deps = makeDeps();
      deps.billingProvider.changeSubscription.mockRejectedValue(
        new BillingProviderRejectedError('card declined'),
      );
      const service = makeService(deps);

      await expect(
        service.upgrade(
          TENANT_ID,
          USER_ID,
          { toPlanId: PLAN_B },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toThrow(ConflictException);
      expect(deps.subscriptionService.confirmUpgrade).not.toHaveBeenCalled();
    });

    it('an invalid target plan is rejected before any provider call', async () => {
      const deps = makeDeps();
      deps.prisma.plan.findUnique.mockResolvedValue(null);
      const service = makeService(deps);

      await expect(
        service.upgrade(
          TENANT_ID,
          USER_ID,
          { toPlanId: PLAN_B },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(deps.billingProvider.changeSubscription).not.toHaveBeenCalled();
    });

    it('rejects when the subscription is not ACTIVE, without calling the provider', async () => {
      const deps = makeDeps();
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ status: 'PAST_DUE' }),
      );
      const service = makeService(deps);

      await expect(
        service.upgrade(
          TENANT_ID,
          USER_ID,
          { toPlanId: PLAN_B },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toThrow(ConflictException);
      expect(deps.billingProvider.changeSubscription).not.toHaveBeenCalled();
    });

    it('already on the target plan short-circuits without calling the provider', async () => {
      const deps = makeDeps();
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ planId: PLAN_B }),
      );
      const service = makeService(deps);

      await service.upgrade(
        TENANT_ID,
        USER_ID,
        { toPlanId: PLAN_B },
        IDEMPOTENCY_KEY,
      );

      expect(deps.billingProvider.changeSubscription).not.toHaveBeenCalled();
      expect(deps.subscriptionService.confirmUpgrade).not.toHaveBeenCalled();
    });
  });

  describe('upgrade — timeout reconciliation', () => {
    it('confirms the upgrade when getSubscription reconciliation shows the new planRef', async () => {
      const deps = makeDeps();
      deps.billingProvider.changeSubscription.mockRejectedValue(
        new BillingProviderTimeoutError('timed out'),
      );
      deps.billingProvider.getSubscription.mockResolvedValue({
        providerSubscriptionId: PROVIDER_SUB_ID,
        currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
        planRef: PLAN_B,
      });
      const service = makeService(deps);

      await service.upgrade(
        TENANT_ID,
        USER_ID,
        { toPlanId: PLAN_B },
        IDEMPOTENCY_KEY,
      );

      expect(deps.billingProvider.getSubscription).toHaveBeenCalledWith(
        PROVIDER_SUB_ID,
      );
      expect(deps.subscriptionService.confirmUpgrade).toHaveBeenCalled();
    });

    it('never blindly retries the mutation, and returns a recoverable error when the outcome cannot be established', async () => {
      const deps = makeDeps();
      deps.billingProvider.changeSubscription.mockRejectedValue(
        new BillingProviderTimeoutError('timed out'),
      );
      deps.billingProvider.getSubscription.mockResolvedValue({
        providerSubscriptionId: PROVIDER_SUB_ID,
        currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
        planRef: PLAN_A, // still the OLD plan — cannot confirm the upgrade took effect
      });
      const service = makeService(deps);

      await expect(
        service.upgrade(
          TENANT_ID,
          USER_ID,
          { toPlanId: PLAN_B },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(deps.subscriptionService.confirmUpgrade).not.toHaveBeenCalled();
      // Exactly one changeSubscription call — no blind retry of the mutation.
      expect(deps.billingProvider.changeSubscription).toHaveBeenCalledTimes(1);
    });
  });

  describe('downgrade — provider-acceptance-first sequencing (P7-D2 Part D)', () => {
    it('persists pendingPlanId only after the provider accepts the at_period_end change', async () => {
      const callOrder: string[] = [];
      const deps = makeDeps(callOrder);
      const service = makeService(deps);

      await service.downgrade(
        TENANT_ID,
        USER_ID,
        { toPlanId: PLAN_B },
        IDEMPOTENCY_KEY,
      );

      expect(deps.billingProvider.changeSubscription).toHaveBeenCalledWith(
        PROVIDER_SUB_ID,
        PLAN_B,
        'at_period_end',
      );
      expect(callOrder).toEqual([
        'provider.changeSubscription',
        'scheduleDowngrade',
      ]);
    });

    it('never persists pendingPlanId on a timeout — no acceptance was confirmed', async () => {
      const deps = makeDeps();
      deps.billingProvider.changeSubscription.mockRejectedValue(
        new BillingProviderTimeoutError('timed out'),
      );
      deps.billingProvider.getSubscription.mockResolvedValue({
        providerSubscriptionId: PROVIDER_SUB_ID,
        currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
      });
      const service = makeService(deps);

      await expect(
        service.downgrade(
          TENANT_ID,
          USER_ID,
          { toPlanId: PLAN_B },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(deps.subscriptionService.scheduleDowngrade).not.toHaveBeenCalled();
    });

    it('provider rejection leaves pendingPlanId unset', async () => {
      const deps = makeDeps();
      deps.billingProvider.changeSubscription.mockRejectedValue(
        new BillingProviderRejectedError('plan not available'),
      );
      const service = makeService(deps);

      await expect(
        service.downgrade(
          TENANT_ID,
          USER_ID,
          { toPlanId: PLAN_B },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toThrow(ConflictException);
      expect(deps.subscriptionService.scheduleDowngrade).not.toHaveBeenCalled();
    });
  });

  describe('cancel — immediate (P7-D2 Part B) vs at period end (Part C)', () => {
    it('atPeriodEnd:false calls cancelSubscription(immediate) then SubscriptionService.cancel', async () => {
      const deps = makeDeps();
      const service = makeService(deps);

      await service.cancel(
        TENANT_ID,
        USER_ID,
        { atPeriodEnd: false },
        IDEMPOTENCY_KEY,
      );

      expect(deps.billingProvider.cancelSubscription).toHaveBeenCalledWith(
        PROVIDER_SUB_ID,
        'immediate',
      );
      expect(deps.subscriptionService.cancel).toHaveBeenCalled();
      expect(
        deps.subscriptionService.scheduleCancellation,
      ).not.toHaveBeenCalled();
    });

    it('atPeriodEnd:true calls cancelSubscription(at_period_end) then scheduleCancellation, never transitions to CANCELLED immediately', async () => {
      const deps = makeDeps();
      const service = makeService(deps);

      await service.cancel(
        TENANT_ID,
        USER_ID,
        { atPeriodEnd: true },
        IDEMPOTENCY_KEY,
      );

      expect(deps.billingProvider.cancelSubscription).toHaveBeenCalledWith(
        PROVIDER_SUB_ID,
        'at_period_end',
      );
      expect(deps.subscriptionService.scheduleCancellation).toHaveBeenCalled();
      expect(deps.subscriptionService.cancel).not.toHaveBeenCalled();
    });

    it('provider failure on immediate cancellation leaves the subscription uncancelled', async () => {
      const deps = makeDeps();
      deps.billingProvider.cancelSubscription.mockRejectedValue(
        new BillingProviderRejectedError('cannot cancel'),
      );
      const service = makeService(deps);

      await expect(
        service.cancel(
          TENANT_ID,
          USER_ID,
          { atPeriodEnd: false },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toThrow(ConflictException);
      expect(deps.subscriptionService.cancel).not.toHaveBeenCalled();
    });
  });

  describe('unscheduleCancellation (Cancellation Retention + Unscheduling wave, P7-D3 Part E)', () => {
    it('calls the provider BEFORE SubscriptionService.unscheduleCancellation (provider-first)', async () => {
      const callOrder: string[] = [];
      const deps = makeDeps(callOrder);
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ cancelAtPeriodEnd: true }),
      );
      deps.billingProvider.unscheduleCancellation.mockImplementation(() => {
        callOrder.push('provider.unscheduleCancellation');
        return Promise.resolve({
          providerSubscriptionId: PROVIDER_SUB_ID,
          currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
          currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
        });
      });
      const service = makeService(deps);

      await service.unscheduleCancellation(TENANT_ID, USER_ID, IDEMPOTENCY_KEY);

      expect(callOrder).toEqual([
        'provider.unscheduleCancellation',
        'unscheduleCancellation',
      ]);
    });

    it('already unscheduled (cancelAtPeriodEnd false/null) is an idempotent no-op — no provider call', async () => {
      const deps = makeDeps();
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ cancelAtPeriodEnd: null }),
      );
      const service = makeService(deps);

      await service.unscheduleCancellation(TENANT_ID, USER_ID, IDEMPOTENCY_KEY);

      expect(
        deps.billingProvider.unscheduleCancellation,
      ).not.toHaveBeenCalled();
      expect(
        deps.subscriptionService.unscheduleCancellation,
      ).not.toHaveBeenCalled();
    });

    it('provider rejection leaves local cancelAtPeriodEnd unchanged', async () => {
      const deps = makeDeps();
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ cancelAtPeriodEnd: true }),
      );
      deps.billingProvider.unscheduleCancellation.mockRejectedValue(
        new BillingProviderRejectedError('cannot unschedule'),
      );
      const service = makeService(deps);

      await expect(
        service.unscheduleCancellation(TENANT_ID, USER_ID, IDEMPOTENCY_KEY),
      ).rejects.toThrow(ConflictException);
      expect(
        deps.subscriptionService.unscheduleCancellation,
      ).not.toHaveBeenCalled();
    });

    it('successful provider confirmation clears the local flag', async () => {
      const deps = makeDeps();
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ cancelAtPeriodEnd: true }),
      );
      const service = makeService(deps);

      await service.unscheduleCancellation(TENANT_ID, USER_ID, IDEMPOTENCY_KEY);

      expect(
        deps.subscriptionService.unscheduleCancellation,
      ).toHaveBeenCalled();
    });

    it('rejects when the subscription is not ACTIVE, without calling the provider', async () => {
      const deps = makeDeps();
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ status: 'PAST_DUE', cancelAtPeriodEnd: true }),
      );
      const service = makeService(deps);

      await expect(
        service.unscheduleCancellation(TENANT_ID, USER_ID, IDEMPOTENCY_KEY),
      ).rejects.toThrow(ConflictException);
      expect(
        deps.billingProvider.unscheduleCancellation,
      ).not.toHaveBeenCalled();
    });

    it('timeout reconciliation: cannot positively confirm the outcome -> recoverable error, no local mutation', async () => {
      const deps = makeDeps();
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ cancelAtPeriodEnd: true }),
      );
      deps.billingProvider.unscheduleCancellation.mockRejectedValue(
        new BillingProviderTimeoutError('timed out'),
      );
      deps.billingProvider.getSubscription.mockResolvedValue({
        providerSubscriptionId: PROVIDER_SUB_ID,
        currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
        // No field exists anywhere on this shape indicating "is a
        // cancellation scheduled" — this IS the disclosed, expected
        // limitation (docs/saas/DECISIONS.md P7-D3 Part E/§6); the
        // outcome can never be positively confirmed through this
        // response, by design.
      });
      const service = makeService(deps);

      await expect(
        service.unscheduleCancellation(TENANT_ID, USER_ID, IDEMPOTENCY_KEY),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(
        deps.subscriptionService.unscheduleCancellation,
      ).not.toHaveBeenCalled();
      // Exactly one attempt — no blind retry of the mutation.
      expect(deps.billingProvider.unscheduleCancellation).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  describe('resume — status-appropriate Stage 1 method, EXPIRED stays terminal', () => {
    it('EXPIRED is rejected without ever calling the provider', async () => {
      const deps = makeDeps();
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ status: 'EXPIRED' }),
      );
      const service = makeService(deps);

      await expect(
        service.resume(TENANT_ID, USER_ID, IDEMPOTENCY_KEY),
      ).rejects.toThrow(ConflictException);
      expect(deps.billingProvider.resumeSubscription).not.toHaveBeenCalled();
    });

    it('PAST_DUE/PAUSED resume calls recoverPayment', async () => {
      const deps = makeDeps();
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ status: 'PAUSED' }),
      );
      const service = makeService(deps);

      await service.resume(TENANT_ID, USER_ID, IDEMPOTENCY_KEY);

      expect(deps.billingProvider.resumeSubscription).toHaveBeenCalledWith(
        PROVIDER_SUB_ID,
      );
      expect(deps.subscriptionService.recoverPayment).toHaveBeenCalled();
      expect(deps.subscriptionService.reactivate).not.toHaveBeenCalled();
    });

    it('CANCELLED resume calls reactivate', async () => {
      const deps = makeDeps();
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ status: 'CANCELLED' }),
      );
      const service = makeService(deps);

      await service.resume(TENANT_ID, USER_ID, IDEMPOTENCY_KEY);

      expect(deps.subscriptionService.reactivate).toHaveBeenCalled();
      expect(deps.subscriptionService.recoverPayment).not.toHaveBeenCalled();
    });

    it('already ACTIVE is a no-op — no provider call, no Stage 1 method call', async () => {
      const deps = makeDeps();
      const service = makeService(deps);

      await service.resume(TENANT_ID, USER_ID, IDEMPOTENCY_KEY);

      expect(deps.billingProvider.resumeSubscription).not.toHaveBeenCalled();
      expect(deps.subscriptionService.recoverPayment).not.toHaveBeenCalled();
      expect(deps.subscriptionService.reactivate).not.toHaveBeenCalled();
    });
  });

  describe('HTTP idempotency (Step 12) — distinct from SubscriptionService CAS idempotency', () => {
    it('a replayed key never re-invokes the provider or SubscriptionService', async () => {
      const deps = makeDeps();
      deps.idempotencyService.findExisting.mockResolvedValue({
        id: 'existing-claim',
        key: IDEMPOTENCY_KEY,
        userId: USER_ID,
        endpoint: 'subscription:upgrade',
        tenantId: TENANT_ID,
        resultOrderId: null,
        expiresAt: new Date(Date.now() + 1000),
        customerId: null,
        createdAt: new Date(),
      });
      const service = makeService(deps);

      await service.upgrade(
        TENANT_ID,
        USER_ID,
        { toPlanId: PLAN_B },
        IDEMPOTENCY_KEY,
      );

      expect(deps.billingProvider.changeSubscription).not.toHaveBeenCalled();
      expect(deps.subscriptionService.confirmUpgrade).not.toHaveBeenCalled();
      expect(deps.idempotencyService.claim).not.toHaveBeenCalled();
    });

    it("a key belonging to a different tenant is rejected, never leaking the other tenant's state", async () => {
      const deps = makeDeps();
      deps.idempotencyService.findExisting.mockResolvedValue({
        id: 'existing-claim',
        key: IDEMPOTENCY_KEY,
        userId: 'other-user',
        endpoint: 'subscription:upgrade',
        tenantId: 'a-different-tenant',
        resultOrderId: null,
        expiresAt: new Date(Date.now() + 1000),
        customerId: null,
        createdAt: new Date(),
      });
      const service = makeService(deps);

      await expect(
        service.upgrade(
          TENANT_ID,
          USER_ID,
          { toPlanId: PLAN_B },
          IDEMPOTENCY_KEY,
        ),
      ).rejects.toThrow(ConflictException);
      expect(deps.billingProvider.changeSubscription).not.toHaveBeenCalled();
    });

    it('a lost idempotency-claim race replays the current state rather than re-running the mutation', async () => {
      const deps = makeDeps();
      deps.idempotencyService.claim.mockResolvedValue(null);
      const service = makeService(deps);

      await service.upgrade(
        TENANT_ID,
        USER_ID,
        { toPlanId: PLAN_B },
        IDEMPOTENCY_KEY,
      );

      expect(deps.billingProvider.changeSubscription).not.toHaveBeenCalled();
      expect(deps.subscriptionService.confirmUpgrade).not.toHaveBeenCalled();
    });
  });

  describe('reconcilePeriod (Step 13 — callable, no cron)', () => {
    it('is a no-op when the confirmed period boundary has not been reached', async () => {
      const deps = makeDeps();
      deps.billingProvider.getSubscription.mockResolvedValue({
        providerSubscriptionId: PROVIDER_SUB_ID,
        currentPeriodStart: new Date('2026-01-01T00:00:00Z'), // same as local — no rollover
        currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
      });
      const service = makeService(deps);

      await service.reconcilePeriod(TENANT_ID);

      expect(
        deps.subscriptionService.applyScheduledDowngrade,
      ).not.toHaveBeenCalled();
      expect(deps.subscriptionService.cancel).not.toHaveBeenCalled();
      expect(deps.subscriptionService.confirmRenewal).not.toHaveBeenCalled();
    });

    it('applies a pending downgrade once the provider-confirmed boundary is reached, and does NOT also confirm a plain renewal', async () => {
      const deps = makeDeps();
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ pendingPlanId: PLAN_B }),
      );
      deps.subscriptionService.applyScheduledDowngrade.mockResolvedValue({
        applied: true,
        subscription: makeSubscription({ planId: PLAN_B, pendingPlanId: null }),
        eventType: 'downgrade_applied',
      });
      deps.billingProvider.getSubscription.mockResolvedValue({
        providerSubscriptionId: PROVIDER_SUB_ID,
        currentPeriodStart: new Date('2026-02-01T00:00:00Z'), // past the local currentPeriodEnd
        currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
      });
      const service = makeService(deps);

      await service.reconcilePeriod(TENANT_ID);

      expect(
        deps.subscriptionService.applyScheduledDowngrade,
      ).toHaveBeenCalled();
      expect(deps.subscriptionService.confirmRenewal).not.toHaveBeenCalled();
    });

    it('applies a scheduled cancellation once the provider-confirmed boundary is reached, and does NOT also confirm a plain renewal', async () => {
      const deps = makeDeps();
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ cancelAtPeriodEnd: true }),
      );
      deps.billingProvider.getSubscription.mockResolvedValue({
        providerSubscriptionId: PROVIDER_SUB_ID,
        currentPeriodStart: new Date('2026-02-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
      });
      const service = makeService(deps);

      await service.reconcilePeriod(TENANT_ID);

      expect(deps.subscriptionService.cancel).toHaveBeenCalled();
      expect(deps.subscriptionService.confirmRenewal).not.toHaveBeenCalled();
    });

    it('docs/saas/DECISIONS.md P7-D5 Part D: calls billingProvider.cancelSubscription(immediate) BEFORE the local cancel — the only point a local-only-scheduling adapter (Razorpay) is ever told to actually stop billing', async () => {
      const deps = makeDeps();
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ cancelAtPeriodEnd: true }),
      );
      deps.billingProvider.getSubscription.mockResolvedValue({
        providerSubscriptionId: PROVIDER_SUB_ID,
        currentPeriodStart: new Date('2026-02-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
      });
      const service = makeService(deps);

      await service.reconcilePeriod(TENANT_ID);

      expect(deps.billingProvider.cancelSubscription).toHaveBeenCalledWith(
        PROVIDER_SUB_ID,
        'immediate',
      );
    });

    it('P7-D5 Part D: a provider cancellation failure at the boundary performs NO local mutation and does not throw — safe to retry on the next scheduler tick', async () => {
      const deps = makeDeps();
      deps.subscriptionService.getSubscriptionForTenant.mockResolvedValue(
        makeSubscription({ cancelAtPeriodEnd: true }),
      );
      deps.billingProvider.getSubscription.mockResolvedValue({
        providerSubscriptionId: PROVIDER_SUB_ID,
        currentPeriodStart: new Date('2026-02-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
      });
      deps.billingProvider.cancelSubscription.mockRejectedValue(
        new Error('network down'),
      );
      const service = makeService(deps);

      await expect(service.reconcilePeriod(TENANT_ID)).resolves.toBeDefined();

      expect(deps.subscriptionService.cancel).not.toHaveBeenCalled();
    });

    it('Phase 7 — Wave A: confirms a plain renewal with the provider-confirmed period when nothing is pending', async () => {
      const deps = makeDeps();
      deps.billingProvider.getSubscription.mockResolvedValue({
        providerSubscriptionId: PROVIDER_SUB_ID,
        currentPeriodStart: new Date('2026-02-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
      });
      const service = makeService(deps);

      await service.reconcilePeriod(TENANT_ID);

      expect(deps.subscriptionService.confirmRenewal).toHaveBeenCalledWith(
        deps.prisma,
        expect.objectContaining({ id: SUB_ID }),
        {
          currentPeriodStart: new Date('2026-02-01T00:00:00Z'),
          currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
        },
      );
      expect(
        deps.subscriptionService.applyScheduledDowngrade,
      ).not.toHaveBeenCalled();
      expect(deps.subscriptionService.cancel).not.toHaveBeenCalled();
    });

    it('never infers the next period locally — always uses the provider-confirmed boundaries, never currentPeriodEnd + a guessed duration', async () => {
      const deps = makeDeps();
      // A provider-confirmed period whose length differs from the local
      // subscription's own prior period — if the orchestration layer ever
      // inferred a new period locally (e.g. old length re-applied), this
      // would diverge from what's asserted below.
      deps.billingProvider.getSubscription.mockResolvedValue({
        providerSubscriptionId: PROVIDER_SUB_ID,
        currentPeriodStart: new Date('2026-02-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-05-15T00:00:00Z'), // irregular length
      });
      const service = makeService(deps);

      await service.reconcilePeriod(TENANT_ID);

      expect(deps.subscriptionService.confirmRenewal).toHaveBeenCalledWith(
        deps.prisma,
        expect.anything(),
        {
          currentPeriodStart: new Date('2026-02-01T00:00:00Z'),
          currentPeriodEnd: new Date('2026-05-15T00:00:00Z'),
        },
      );
    });

    it('is safe to call repeatedly (idempotent no-op — confirmRenewal itself becomes a no-op once the period is already current)', async () => {
      const deps = makeDeps();
      deps.billingProvider.getSubscription.mockResolvedValue({
        providerSubscriptionId: PROVIDER_SUB_ID,
        currentPeriodStart: new Date('2026-02-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-03-01T00:00:00Z'),
      });
      const service = makeService(deps);

      await service.reconcilePeriod(TENANT_ID);
      await service.reconcilePeriod(TENANT_ID);

      expect(
        deps.subscriptionService.applyScheduledDowngrade,
      ).not.toHaveBeenCalled();
      expect(deps.subscriptionService.cancel).not.toHaveBeenCalled();
      // Both calls reach confirmRenewal (SubscriptionService's own CAS/
      // provider-period comparison is what makes the SECOND call a
      // no-op — see subscription.service.spec.ts's own idempotency test);
      // the orchestration layer itself calls it unconditionally both times.
      expect(deps.subscriptionService.confirmRenewal).toHaveBeenCalledTimes(2);
    });

    it('provider failure during reconciliation surfaces a recoverable error and performs no local mutation', async () => {
      const deps = makeDeps();
      deps.billingProvider.getSubscription.mockRejectedValue(
        new Error('network down'),
      );
      const service = makeService(deps);

      await expect(service.reconcilePeriod(TENANT_ID)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(
        deps.subscriptionService.applyScheduledDowngrade,
      ).not.toHaveBeenCalled();
      expect(deps.subscriptionService.cancel).not.toHaveBeenCalled();
      expect(deps.subscriptionService.confirmRenewal).not.toHaveBeenCalled();
    });

    it('a provider timeout during reconciliation is treated the same as any other unreachable-provider failure — no local mutation', async () => {
      const deps = makeDeps();
      deps.billingProvider.getSubscription.mockRejectedValue(
        new BillingProviderTimeoutError('timed out'),
      );
      const service = makeService(deps);

      await expect(service.reconcilePeriod(TENANT_ID)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(deps.subscriptionService.confirmRenewal).not.toHaveBeenCalled();
    });
  });

  describe('create — no optimistic mutation on provider failure', () => {
    it('provider rejection during createCustomer creates no local Subscription row', async () => {
      const deps = makeDeps();
      deps.billingProvider.createCustomer.mockRejectedValue(
        new BillingProviderRejectedError('cannot create customer'),
      );
      const service = makeService(deps);

      await expect(
        service.createSubscription(TENANT_ID, PLAN_B),
      ).rejects.toThrow(ConflictException);
      expect(
        deps.subscriptionService.createPendingSubscription,
      ).not.toHaveBeenCalled();
    });

    it('a tenant that already has a subscription is rejected before any provider call', async () => {
      const deps = makeDeps();
      deps.subscriptionService.findSubscriptionForTenant.mockResolvedValue(
        makeSubscription(),
      );
      const service = makeService(deps);

      await expect(
        service.createSubscription(TENANT_ID, PLAN_B),
      ).rejects.toThrow(ConflictException);
      expect(deps.billingProvider.createCustomer).not.toHaveBeenCalled();
    });
  });
});
