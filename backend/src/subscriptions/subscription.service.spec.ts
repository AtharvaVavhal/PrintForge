import { ConflictException, NotFoundException } from '@nestjs/common';
import { Subscription } from '@prisma/client';
import { SubscriptionService } from './subscription.service';

/**
 * Phase 7 Stage 1 (docs/saas/DECISIONS.md P7-D1). Unit tests against a
 * mocked Prisma client — same convention as every other `*.service.spec
 * .ts` in this repo (`platform-plans.service.spec.ts`,
 * `limit-enforcement.service.spec.ts`). Real-Postgres CAS/transaction
 * proof lives in `test/e2e/subscription-lifecycle.e2e-spec.ts`.
 */
describe('SubscriptionService', () => {
  const TENANT_ID = 'tenant-a';
  const SUB_ID = 'sub-1';
  const PLAN_A = 'plan-a';
  const PLAN_B = 'plan-b';

  function makeSubscription(
    overrides: Partial<Subscription> = {},
  ): Subscription {
    return {
      id: SUB_ID,
      tenantId: TENANT_ID,
      planId: PLAN_A,
      status: 'PENDING',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      providerCustomerId: null,
      providerSubscriptionId: null,
      cancelAtPeriodEnd: null,
      trialEndsAt: null,
      pendingPlanId: null,
      graceEndsAt: null,
      updatedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  function makeClient(
    opts: {
      updateManyCount?: number;
      planExists?: boolean;
      findUniqueResult?: Subscription;
    } = {},
  ) {
    const updateMany = jest
      .fn()
      .mockResolvedValue({ count: opts.updateManyCount ?? 1 });
    const findUniqueOrThrow = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(opts.findUniqueResult ?? makeSubscription()),
      );
    const create = jest.fn().mockResolvedValue(makeSubscription());
    const eventCreate = jest.fn().mockResolvedValue(undefined);
    const planFindUnique = jest
      .fn()
      .mockResolvedValue(opts.planExists === false ? null : { id: PLAN_B });
    const client = {
      subscription: {
        updateMany,
        findUniqueOrThrow,
        create,
        findUnique: jest.fn(),
      },
      subscriptionEvent: { create: eventCreate },
      plan: { findUnique: planFindUnique },
    };
    return {
      client,
      updateMany,
      findUniqueOrThrow,
      create,
      eventCreate,
      planFindUnique,
    };
  }

  describe('getSubscriptionForTenant', () => {
    it('returns the tenant-scoped subscription', async () => {
      const { client } = makeClient();
      client.subscription.findUnique.mockResolvedValue(makeSubscription());
      const service = new SubscriptionService(client as never);

      const result = await service.getSubscriptionForTenant(
        client as never,
        TENANT_ID,
      );

      expect(result.tenantId).toBe(TENANT_ID);
      expect(client.subscription.findUnique).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
      });
    });

    it('404s when no subscription exists for the tenant', async () => {
      const { client } = makeClient();
      client.subscription.findUnique.mockResolvedValue(null);
      const service = new SubscriptionService(client as never);

      await expect(
        service.getSubscriptionForTenant(client as never, TENANT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createPendingSubscription', () => {
    it('creates the row at PENDING and writes a `created` event with fromStatus null', async () => {
      const { client, create, eventCreate } = makeClient();
      const service = new SubscriptionService(client as never);

      await service.createPendingSubscription(
        client as never,
        TENANT_ID,
        PLAN_A,
      );

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            planId: PLAN_A,
            status: 'PENDING',
          }),
        }),
      );
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            type: 'created',
            fromStatus: null,
            toStatus: 'PENDING',
            toPlanId: PLAN_A,
          }),
        }),
      );
    });
  });

  describe('confirmActivation', () => {
    it('PENDING -> ACTIVE: CAS-updates status/period fields and writes an `activated` event', async () => {
      const { client, updateMany, eventCreate } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({ status: 'PENDING' });
      const start = new Date('2026-02-01T00:00:00Z');
      const end = new Date('2026-03-01T00:00:00Z');

      const result = await service.confirmActivation(
        client as never,
        subscription,
        {
          toStatus: 'ACTIVE',
          currentPeriodStart: start,
          currentPeriodEnd: end,
          providerEventId: 'evt-1',
        },
      );

      expect(result.applied).toBe(true);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'PENDING' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          status: 'ACTIVE',
          currentPeriodStart: start,
          currentPeriodEnd: end,
        }),
      });
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            type: 'activated',
            fromStatus: 'PENDING',
            toStatus: 'ACTIVE',
            providerEventId: 'evt-1',
          }),
        }),
      );
    });

    it('rejects PAST_DUE -> TRIALING (not a ratified edge) without touching the database', async () => {
      const { client, updateMany } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({ status: 'PAST_DUE' });

      await expect(
        service.confirmActivation(client as never, subscription, {
          toStatus: 'TRIALING',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
        }),
      ).rejects.toThrow(ConflictException);
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('is idempotent: already at the target status is a no-op, no event written', async () => {
      const { client, updateMany, eventCreate } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({ status: 'ACTIVE' });

      const result = await service.confirmActivation(
        client as never,
        subscription,
        {
          toStatus: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
        },
      );

      expect(result.applied).toBe(false);
      expect(updateMany).not.toHaveBeenCalled();
      expect(eventCreate).not.toHaveBeenCalled();
    });

    it('a lost CAS race (updateMany affects 0 rows) is a safe no-op, never an error', async () => {
      const { client, eventCreate } = makeClient({ updateManyCount: 0 });
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({ status: 'PENDING' });

      const result = await service.confirmActivation(
        client as never,
        subscription,
        {
          toStatus: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
        },
      );

      expect(result.applied).toBe(false);
      expect(eventCreate).not.toHaveBeenCalled();
    });
  });

  describe('recordPaymentFailure / recoverPayment / exhaustGrace', () => {
    it('ACTIVE -> PAST_DUE sets graceEndsAt and writes payment_failed', async () => {
      const { client, updateMany, eventCreate } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({ status: 'ACTIVE' });
      const graceEndsAt = new Date('2026-02-10T00:00:00Z');

      const result = await service.recordPaymentFailure(
        client as never,
        subscription,
        {
          graceEndsAt,
        },
      );

      expect(result.applied).toBe(true);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'ACTIVE' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ status: 'PAST_DUE', graceEndsAt }),
      });
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ type: 'payment_failed' }),
        }),
      );
    });

    it('a duplicate payment-failure webhook for an already PAST_DUE subscription is idempotent (no re-extension of grace, no second event)', async () => {
      const { client, updateMany, eventCreate } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({
        status: 'PAST_DUE',
        graceEndsAt: new Date('2026-02-10T00:00:00Z'),
      });

      const result = await service.recordPaymentFailure(
        client as never,
        subscription,
        {
          graceEndsAt: new Date('2026-02-20T00:00:00Z'), // different — must be IGNORED
        },
      );

      expect(result.applied).toBe(false);
      expect(updateMany).not.toHaveBeenCalled();
      expect(eventCreate).not.toHaveBeenCalled();
    });

    it('PAST_DUE -> ACTIVE on recovery clears graceEndsAt and writes resumed', async () => {
      const { client, updateMany, eventCreate } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({
        status: 'PAST_DUE',
        graceEndsAt: new Date(),
      });

      await service.recoverPayment(client as never, subscription, {});

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'PAST_DUE' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ status: 'ACTIVE', graceEndsAt: null }),
      });
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ type: 'resumed' }),
        }),
      );
    });

    it('PAUSED -> ACTIVE recovery is also allowed', async () => {
      const { client, updateMany } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({ status: 'PAUSED' });

      await service.recoverPayment(client as never, subscription, {});

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'PAUSED' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ status: 'ACTIVE' }),
      });
    });

    it('PAST_DUE -> PAUSED on grace exhaustion writes paused', async () => {
      const { client, updateMany, eventCreate } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({ status: 'PAST_DUE' });

      await service.exhaustGrace(client as never, subscription, {});

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'PAST_DUE' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ status: 'PAUSED' }),
      });
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ type: 'paused' }),
        }),
      );
    });
  });

  describe('confirmUpgrade', () => {
    it('ACTIVE -> ACTIVE: validates the target plan exists, CAS-updates planId, writes upgraded', async () => {
      const { client, updateMany, eventCreate, planFindUnique } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({
        status: 'ACTIVE',
        planId: PLAN_A,
      });

      const result = await service.confirmUpgrade(
        client as never,
        subscription,
        {
          toPlanId: PLAN_B,
          providerEventId: 'evt-up-1',
        },
      );

      expect(planFindUnique).toHaveBeenCalledWith({ where: { id: PLAN_B } });
      expect(result.applied).toBe(true);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'ACTIVE', planId: PLAN_A },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ planId: PLAN_B }),
      });
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            type: 'upgraded',
            fromPlanId: PLAN_A,
            toPlanId: PLAN_B,
          }),
        }),
      );
    });

    it('404s when the target plan does not exist, never touches the database', async () => {
      const { client, updateMany } = makeClient({ planExists: false });
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({ status: 'ACTIVE' });

      await expect(
        service.confirmUpgrade(client as never, subscription, {
          toPlanId: 'ghost',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('is idempotent: planId already equals toPlanId is a no-op', async () => {
      const { client, updateMany } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({
        status: 'ACTIVE',
        planId: PLAN_A,
      });

      const result = await service.confirmUpgrade(
        client as never,
        subscription,
        {
          toPlanId: PLAN_A,
        },
      );

      expect(result.applied).toBe(false);
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('rejects an upgrade attempt when not currently ACTIVE', async () => {
      const { client } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({
        status: 'PENDING',
        planId: PLAN_A,
      });

      await expect(
        service.confirmUpgrade(client as never, subscription, {
          toPlanId: PLAN_B,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('scheduleDowngrade / applyScheduledDowngrade', () => {
    it('scheduleDowngrade sets ONLY pendingPlanId — planId and status are untouched', async () => {
      const { client, updateMany, eventCreate } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({
        status: 'ACTIVE',
        planId: PLAN_A,
      });

      const result = await service.scheduleDowngrade(
        client as never,
        subscription,
        {
          pendingPlanId: PLAN_B,
        },
      );

      expect(result.applied).toBe(true);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'ACTIVE', pendingPlanId: null },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ pendingPlanId: PLAN_B }),
      });
      const dataArg =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (updateMany.mock.calls[0][0] as { data: Record<string, unknown> }).data;
      expect(dataArg).not.toHaveProperty('planId');
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ type: 'downgrade_scheduled' }),
        }),
      );
    });

    it('scheduleDowngrade is idempotent: pendingPlanId already equals the request is a no-op', async () => {
      const { client, updateMany } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({
        status: 'ACTIVE',
        pendingPlanId: PLAN_B,
      });

      const result = await service.scheduleDowngrade(
        client as never,
        subscription,
        {
          pendingPlanId: PLAN_B,
        },
      );

      expect(result.applied).toBe(false);
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('applyScheduledDowngrade moves pendingPlanId into planId, clears pendingPlanId, updates the period, and writes downgrade_applied', async () => {
      const { client, updateMany, eventCreate } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({
        status: 'ACTIVE',
        planId: PLAN_A,
        pendingPlanId: PLAN_B,
      });
      const start = new Date('2026-03-01T00:00:00Z');
      const end = new Date('2026-04-01T00:00:00Z');

      const result = await service.applyScheduledDowngrade(
        client as never,
        subscription,
        {
          currentPeriodStart: start,
          currentPeriodEnd: end,
        },
      );

      expect(result.applied).toBe(true);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'ACTIVE', pendingPlanId: PLAN_B },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          planId: PLAN_B,
          pendingPlanId: null,
          currentPeriodStart: start,
          currentPeriodEnd: end,
        }),
      });
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            type: 'downgrade_applied',
            fromPlanId: PLAN_A,
            toPlanId: PLAN_B,
          }),
        }),
      );
    });

    it('applyScheduledDowngrade is a no-op when nothing is scheduled', async () => {
      const { client, updateMany } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({
        status: 'ACTIVE',
        pendingPlanId: null,
      });

      const result = await service.applyScheduledDowngrade(
        client as never,
        subscription,
        {
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
        },
      );

      expect(result.applied).toBe(false);
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('scheduleCancellation (Stage 2, P7-D2 Part C)', () => {
    it('sets ONLY cancelAtPeriodEnd — status and planId are untouched', async () => {
      const { client, updateMany, eventCreate } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({
        status: 'ACTIVE',
        cancelAtPeriodEnd: null,
      });

      const result = await service.scheduleCancellation(
        client as never,
        subscription,
      );

      expect(result.applied).toBe(true);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'ACTIVE', cancelAtPeriodEnd: null },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ cancelAtPeriodEnd: true }),
      });
      const dataArg =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (updateMany.mock.calls[0][0] as { data: Record<string, unknown> }).data;
      expect(dataArg).not.toHaveProperty('status');
      expect(dataArg).not.toHaveProperty('planId');
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // toStatus stays 'ACTIVE' (unchanged) — this is scheduling, not
          // an actual cancellation; metadata.scheduled disambiguates it
          // from a real cancelled event, both of which share this type.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            type: 'cancelled',
            toStatus: 'ACTIVE',
            metadata: { scheduled: true },
          }),
        }),
      );
    });

    it('is idempotent: cancelAtPeriodEnd already true is a safe no-op', async () => {
      const { client, updateMany } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({
        status: 'ACTIVE',
        cancelAtPeriodEnd: true,
      });

      const result = await service.scheduleCancellation(
        client as never,
        subscription,
      );

      expect(result.applied).toBe(false);
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('rejects when the subscription is not currently ACTIVE', async () => {
      const { client } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({
        status: 'PENDING',
        cancelAtPeriodEnd: null,
      });

      await expect(
        service.scheduleCancellation(client as never, subscription),
      ).rejects.toThrow(ConflictException);
    });

    it('a lost CAS race is a safe no-op, never an error', async () => {
      const { client, updateMany } = makeClient({ updateManyCount: 0 });
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({
        status: 'ACTIVE',
        cancelAtPeriodEnd: null,
      });

      const result = await service.scheduleCancellation(
        client as never,
        subscription,
      );

      expect(result.applied).toBe(false);
      expect(updateMany).toHaveBeenCalled();
    });
  });

  describe('cancel / reactivate / expire', () => {
    it('PAST_DUE -> CANCELLED is allowed', async () => {
      const { client, updateMany } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({ status: 'PAST_DUE' });

      await service.cancel(client as never, subscription, {});

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'PAST_DUE' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ status: 'CANCELLED' }),
      });
    });

    it('PAUSED -> CANCELLED is allowed', async () => {
      const { client, updateMany } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({ status: 'PAUSED' });

      await service.cancel(client as never, subscription, {});

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'PAUSED' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ status: 'CANCELLED' }),
      });
    });

    it('ACTIVE -> CANCELLED is allowed (P7-D2 Part B — immediate cancellation, amends P7-D1)', async () => {
      const { client, updateMany, eventCreate } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({ status: 'ACTIVE' });

      await service.cancel(client as never, subscription, {});

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'ACTIVE' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ status: 'CANCELLED' }),
      });
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ type: 'cancelled' }),
        }),
      );
    });

    it('CANCELLED -> ACTIVE reactivation is allowed', async () => {
      const { client, updateMany, eventCreate } = makeClient();
      const service = new SubscriptionService(client as never);
      const subscription = makeSubscription({ status: 'CANCELLED' });

      await service.reactivate(client as never, subscription, {});

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'CANCELLED' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ status: 'ACTIVE' }),
      });
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ type: 'reactivated' }),
        }),
      );
    });

    it('PAUSED -> EXPIRED and CANCELLED -> EXPIRED are both allowed', async () => {
      const { client, updateMany } = makeClient();
      const service = new SubscriptionService(client as never);

      await service.expire(
        client as never,
        makeSubscription({ status: 'PAUSED' }),
        {},
      );
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'PAUSED' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ status: 'EXPIRED' }),
      });

      updateMany.mockClear();
      await service.expire(
        client as never,
        makeSubscription({ status: 'CANCELLED' }),
        {},
      );
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: SUB_ID, status: 'CANCELLED' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ status: 'EXPIRED' }),
      });
    });

    it('EXPIRED is terminal: any further call is rejected, never a silent success', async () => {
      const { client, updateMany } = makeClient();
      const service = new SubscriptionService(client as never);
      const expired = makeSubscription({ status: 'EXPIRED' });

      await expect(
        service.cancel(client as never, expired, {}),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.reactivate(client as never, expired, {}),
      ).rejects.toThrow(ConflictException);
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('expire() on an already-EXPIRED subscription is an idempotent no-op, not a throw', async () => {
      const { client, updateMany } = makeClient();
      const service = new SubscriptionService(client as never);
      const expired = makeSubscription({ status: 'EXPIRED' });

      const result = await service.expire(client as never, expired, {});

      expect(result.applied).toBe(false);
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('providerEventId is never used for deduplication (P7-D1 Part F)', () => {
    it('two calls with the IDENTICAL providerEventId succeed independently when the state actually changes between them', async () => {
      const { client, eventCreate } = makeClient();
      const service = new SubscriptionService(client as never);

      // First call: PENDING -> ACTIVE.
      await service.confirmActivation(
        client as never,
        makeSubscription({ status: 'PENDING' }),
        {
          toStatus: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          providerEventId: 'evt-shared',
        },
      );
      // Second call, same providerEventId, genuinely different transition
      // (ACTIVE -> PAST_DUE) — never rejected merely because the event id
      // repeats; SubscriptionEvent.providerEventId carries no unique
      // constraint.
      await service.recordPaymentFailure(
        client as never,
        makeSubscription({ status: 'ACTIVE' }),
        { graceEndsAt: new Date(), providerEventId: 'evt-shared' },
      );

      expect(eventCreate).toHaveBeenCalledTimes(2);
    });
  });
});
