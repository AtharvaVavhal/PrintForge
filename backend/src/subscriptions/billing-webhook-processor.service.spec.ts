jest.mock('@sentry/node');
import { ConflictException } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { BillingWebhookProcessor } from './billing-webhook-processor.service';

const captureException = Sentry.captureException as jest.Mock;

interface UpdateData {
  status?: string;
  attempts?: number;
  lastError?: string;
  availableAt?: Date;
  processedAt?: Date;
}

interface LockedRow {
  id: string;
  payload: unknown;
  attempts: number;
  createdAt: Date;
}

const NOW = new Date('2026-09-13T12:00:00Z');
const SUBSCRIPTION = {
  id: 'sub-1',
  tenantId: 'tenant-a',
  status: 'ACTIVE',
  updatedAt: new Date('2026-09-01T00:00:00Z'), // older than NOW-ish events below
};

/**
 * Phase 7 — D7 SaaS Billing Webhooks wave (docs/saas/DECISIONS.md P7-D3).
 * Unit tests against a mocked Prisma client/SubscriptionService — same
 * "outer update = catch-block write via this.prisma, tx update = the
 * in-transaction write" convention `payments/webhooks/
 * webhook-processor.service.spec.ts` already establishes for the commerce
 * poller. Real-Postgres locking/dedup proof lives in
 * `test/e2e/billing-webhooks.e2e-spec.ts`.
 */
describe('BillingWebhookProcessor', () => {
  function build(
    row: Partial<LockedRow> = {},
    opts: { dueRows?: Array<{ id: string }> } = {},
  ) {
    const lockedRow: LockedRow = {
      id: 'bwe-1',
      payload: {
        providerEventId: 'evt-1',
        type: 'cancelled',
        payload: {
          providerSubscriptionId: 'fake-sub-1',
          occurredAt: NOW.toISOString(),
        },
      },
      attempts: 0,
      createdAt: NOW,
      ...row,
    };
    const txUpdates: UpdateData[] = [];
    const outerUpdates: UpdateData[] = [];
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([lockedRow]),
      billingWebhookEvent: {
        update: jest.fn((args: { data: UpdateData }) => {
          txUpdates.push(args.data);
          return Promise.resolve({});
        }),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
      billingWebhookEvent: {
        update: jest.fn((args: { data: UpdateData }) => {
          outerUpdates.push(args.data);
          return Promise.resolve({});
        }),
        findMany: jest
          .fn()
          .mockResolvedValue(opts.dueRows ?? [{ id: lockedRow.id }]),
      },
    };
    const subscriptionService = {
      findSubscriptionByProviderSubscriptionId: jest
        .fn()
        .mockResolvedValue(SUBSCRIPTION),
      findSubscriptionByProviderCustomerId: jest
        .fn()
        .mockResolvedValue(SUBSCRIPTION),
      applyBillingWebhookEvent: jest.fn().mockResolvedValue({
        applied: true,
        subscription: SUBSCRIPTION,
        eventType: 'cancelled',
      }),
    };
    const processor = new BillingWebhookProcessor(
      prisma as never,
      subscriptionService as never,
    );
    return {
      processor,
      prisma,
      tx,
      subscriptionService,
      txUpdates,
      outerUpdates,
    };
  }

  beforeEach(() => {
    captureException.mockClear();
  });

  it('an empty due-set is a no-op — no lock, no update, no error', async () => {
    const { processor, tx, prisma } = build(undefined, { dueRows: [] });

    await processor.processReceivedBillingWebhooks();

    expect(prisma.billingWebhookEvent.findMany).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('resolves the subscription by providerSubscriptionId first, then applies the event and marks PROCESSED', async () => {
    const { processor, subscriptionService, txUpdates } = build();

    await processor.processReceivedBillingWebhooks();

    expect(
      subscriptionService.findSubscriptionByProviderSubscriptionId,
    ).toHaveBeenCalledWith(expect.anything(), 'fake-sub-1');
    expect(subscriptionService.applyBillingWebhookEvent).toHaveBeenCalledTimes(
      1,
    );
    expect(txUpdates[0].status).toBe('PROCESSED');
    expect(txUpdates[0].processedAt).toBeInstanceOf(Date);
  });

  it('falls back to providerCustomerId when the event carries no providerSubscriptionId', async () => {
    const { processor, subscriptionService } = build({
      payload: {
        providerEventId: 'evt-2',
        type: 'cancelled',
        payload: {
          providerCustomerId: 'fake-cust-1',
          occurredAt: NOW.toISOString(),
        },
      },
    });

    await processor.processReceivedBillingWebhooks();

    expect(
      subscriptionService.findSubscriptionByProviderSubscriptionId,
    ).not.toHaveBeenCalled();
    expect(
      subscriptionService.findSubscriptionByProviderCustomerId,
    ).toHaveBeenCalledWith(expect.anything(), 'fake-cust-1');
  });

  it('an unresolvable subscription is marked IGNORED with a useful lastError — never calls applyBillingWebhookEvent, never crashes', async () => {
    const { processor, subscriptionService, txUpdates } = build();
    subscriptionService.findSubscriptionByProviderSubscriptionId.mockResolvedValue(
      null,
    );

    await processor.processReceivedBillingWebhooks();

    expect(subscriptionService.applyBillingWebhookEvent).not.toHaveBeenCalled();
    expect(txUpdates[0].status).toBe('IGNORED');
    expect(txUpdates[0].lastError).toMatch(/no matching local subscription/);
  });

  it('a stale event (timestamp <= Subscription.updatedAt) is marked IGNORED and never applied — state is never regressed', async () => {
    const { processor, subscriptionService, txUpdates } = build({
      payload: {
        providerEventId: 'evt-stale',
        type: 'cancelled',
        payload: {
          providerSubscriptionId: 'fake-sub-1',
          occurredAt: new Date('2026-08-01T00:00:00Z').toISOString(), // before SUBSCRIPTION.updatedAt
        },
      },
    });

    await processor.processReceivedBillingWebhooks();

    expect(subscriptionService.applyBillingWebhookEvent).not.toHaveBeenCalled();
    expect(txUpdates[0].status).toBe('IGNORED');
    expect(txUpdates[0].lastError).toMatch(/stale/);
  });

  it('an out-of-order event falls back to the row createdAt (receivedAt) when it carries no occurredAt', async () => {
    const { processor, subscriptionService, txUpdates } = build({
      createdAt: new Date('2026-08-01T00:00:00Z'), // before SUBSCRIPTION.updatedAt
      payload: {
        providerEventId: 'evt-no-ts',
        type: 'cancelled',
        payload: { providerSubscriptionId: 'fake-sub-1' },
      },
    });

    await processor.processReceivedBillingWebhooks();

    expect(subscriptionService.applyBillingWebhookEvent).not.toHaveBeenCalled();
    expect(txUpdates[0].status).toBe('IGNORED');
  });

  it('per-row failure isolation — one throwing row does not stop the batch', async () => {
    const { processor, tx, subscriptionService, outerUpdates } = build(
      undefined,
      { dueRows: [{ id: 'bwe-1' }, { id: 'bwe-2' }] },
    );
    tx.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'bwe-1',
          payload: {
            providerEventId: 'evt-1',
            type: 'cancelled',
            payload: {
              providerSubscriptionId: 'fake-sub-1',
              occurredAt: NOW.toISOString(),
            },
          },
          attempts: 0,
          createdAt: NOW,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'bwe-2',
          payload: {
            providerEventId: 'evt-2',
            type: 'cancelled',
            payload: {
              providerSubscriptionId: 'fake-sub-1',
              occurredAt: NOW.toISOString(),
            },
          },
          attempts: 0,
          createdAt: NOW,
        },
      ]);
    subscriptionService.applyBillingWebhookEvent
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        applied: true,
        subscription: SUBSCRIPTION,
        eventType: 'cancelled',
      });

    await processor.processReceivedBillingWebhooks();

    // Row 1 failed (retryable, written via the outer prisma client);
    // row 2 still got processed despite row 1's failure.
    expect(outerUpdates).toHaveLength(1);
    expect(outerUpdates[0].status).toBe('PROCESSING_FAILED');
  });

  it('finder/query failure isolation — the batch query itself throwing does not crash the process', async () => {
    const { processor, prisma } = build();
    prisma.billingWebhookEvent.findMany.mockRejectedValue(new Error('db down'));

    await expect(
      processor.processReceivedBillingWebhooks(),
    ).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('an illegal-transition ConflictException is non-retryable — immediate FAILED + Sentry, via the outer client', async () => {
    const { processor, subscriptionService, outerUpdates } = build();
    subscriptionService.applyBillingWebhookEvent.mockRejectedValue(
      new ConflictException(
        'Illegal subscription transition: EXPIRED -> CANCELLED',
      ),
    );

    await processor.processReceivedBillingWebhooks();

    expect(outerUpdates[0].status).toBe('FAILED');
    expect(outerUpdates[0].attempts).toBe(1);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('a generic processing failure increments attempts, sets PROCESSING_FAILED and a ~30s backoff', async () => {
    const { processor, subscriptionService, outerUpdates } = build();
    subscriptionService.applyBillingWebhookEvent.mockRejectedValue(
      new Error('transient'),
    );

    await processor.processReceivedBillingWebhooks();

    expect(outerUpdates[0].status).toBe('PROCESSING_FAILED');
    expect(outerUpdates[0].attempts).toBe(1);
    const delayMs =
      (outerUpdates[0].availableAt as Date).getTime() - Date.now();
    expect(delayMs).toBeGreaterThan(20_000);
    expect(delayMs).toBeLessThan(40_000);
  });

  it('stops retrying after the maximum attempts — terminal FAILED + Sentry error', async () => {
    const { processor, subscriptionService, outerUpdates } = build({
      attempts: 5,
    }); // -> attempt 6 = MAX
    subscriptionService.applyBillingWebhookEvent.mockRejectedValue(
      new Error('permanent'),
    );

    await processor.processReceivedBillingWebhooks();

    expect(outerUpdates[0].status).toBe('FAILED');
    expect(outerUpdates[0].attempts).toBe(6);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('an already-locked row (concurrent tick) returns no rows and is a silent no-op', async () => {
    const { processor, tx, subscriptionService, txUpdates } = build();
    tx.$queryRaw.mockResolvedValue([]);

    await processor.processReceivedBillingWebhooks();

    expect(subscriptionService.applyBillingWebhookEvent).not.toHaveBeenCalled();
    expect(txUpdates).toHaveLength(0);
  });
});
