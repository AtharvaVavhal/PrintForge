import { FakeBillingProvider } from './fake-billing-provider';

/**
 * Phase 7 Stage 1 (docs/saas/DECISIONS.md P7-D1, Part G); the module under
 * test relocated to `src/subscriptions/fake-billing-provider.ts` in Phase
 * 7 Stage 2 (P7-D2 Part G — see that file's own updated header comment).
 * This spec was already colocated under `src/subscriptions/` for
 * `package.json`'s jest `rootDir: "src"` unit-test discovery — the import
 * below is now a same-directory relative path rather than a reach into
 * `test/e2e/support/`.
 */
describe('FakeBillingProvider (Phase 7 Stage 1 test double)', () => {
  it('createCustomer returns a deterministic-shaped, unique providerCustomerId', async () => {
    const provider = new FakeBillingProvider();

    const a = await provider.createCustomer('tenant-a');
    const b = await provider.createCustomer('tenant-a');

    expect(a.providerCustomerId).toMatch(/^fake-cust-/);
    expect(a.providerCustomerId).not.toBe(b.providerCustomerId);
  });

  it('createSubscription returns a real period window (start < end)', async () => {
    const provider = new FakeBillingProvider();
    const customer = await provider.createCustomer('tenant-a');

    const sub = await provider.createSubscription(
      customer.providerCustomerId,
      'plan-ref-1',
    );

    expect(sub.providerSubscriptionId).toMatch(/^fake-sub-/);
    expect(sub.currentPeriodStart.getTime()).toBeLessThan(
      sub.currentPeriodEnd.getTime(),
    );
  });

  it('changeSubscription (confirmed activation/trial + immediate upgrade confirmation) updates the fake record', async () => {
    const provider = new FakeBillingProvider();
    const customer = await provider.createCustomer('tenant-a');
    const sub = await provider.createSubscription(
      customer.providerCustomerId,
      'plan-ref-1',
    );

    const changed = await provider.changeSubscription(
      sub.providerSubscriptionId,
      'plan-ref-2',
      'immediate',
    );

    expect(changed.providerSubscriptionId).toBe(sub.providerSubscriptionId);
    const fetched = await provider.getSubscription(sub.providerSubscriptionId);
    expect(fetched.providerSubscriptionId).toBe(sub.providerSubscriptionId);
  });

  it('downgrade scheduling (mode: at_period_end) does not throw and does not change the period', async () => {
    const provider = new FakeBillingProvider();
    const customer = await provider.createCustomer('tenant-a');
    const sub = await provider.createSubscription(
      customer.providerCustomerId,
      'plan-ref-1',
    );

    const changed = await provider.changeSubscription(
      sub.providerSubscriptionId,
      'plan-ref-2',
      'at_period_end',
    );

    expect(changed.currentPeriodStart).toEqual(sub.currentPeriodStart);
    expect(changed.currentPeriodEnd).toEqual(sub.currentPeriodEnd);
  });

  it('cancellation and resume/reactivation both succeed against the same fake subscription', async () => {
    const provider = new FakeBillingProvider();
    const customer = await provider.createCustomer('tenant-a');
    const sub = await provider.createSubscription(
      customer.providerCustomerId,
      'plan-ref-1',
    );

    await expect(
      provider.cancelSubscription(sub.providerSubscriptionId, 'immediate'),
    ).resolves.toBeUndefined();
    await expect(
      provider.resumeSubscription(sub.providerSubscriptionId),
    ).resolves.toMatchObject({
      providerSubscriptionId: sub.providerSubscriptionId,
    });
  });

  it('cancelSubscription(mode: at_period_end) schedules a cancellation without touching the immediate-cancel flag, and unscheduleCancellation reverses it', async () => {
    const provider = new FakeBillingProvider();
    const customer = await provider.createCustomer('tenant-a');
    const sub = await provider.createSubscription(
      customer.providerCustomerId,
      'plan-ref-1',
    );

    await provider.cancelSubscription(
      sub.providerSubscriptionId,
      'at_period_end',
    );
    expect(provider.isCancellationScheduled(sub.providerSubscriptionId)).toBe(
      true,
    );

    const unscheduled = await provider.unscheduleCancellation(
      sub.providerSubscriptionId,
    );

    expect(unscheduled.providerSubscriptionId).toBe(sub.providerSubscriptionId);
    expect(provider.isCancellationScheduled(sub.providerSubscriptionId)).toBe(
      false,
    );
    // Plan and period are unaffected by scheduling/unscheduling a cancellation.
    expect(unscheduled.currentPeriodStart).toEqual(sub.currentPeriodStart);
    expect(unscheduled.currentPeriodEnd).toEqual(sub.currentPeriodEnd);
  });

  it('unscheduleCancellation on a subscription with nothing scheduled is a harmless no-op, never throws', async () => {
    const provider = new FakeBillingProvider();
    const customer = await provider.createCustomer('tenant-a');
    const sub = await provider.createSubscription(
      customer.providerCustomerId,
      'plan-ref-1',
    );

    await expect(
      provider.unscheduleCancellation(sub.providerSubscriptionId),
    ).resolves.toMatchObject({
      providerSubscriptionId: sub.providerSubscriptionId,
    });
    expect(provider.isCancellationScheduled(sub.providerSubscriptionId)).toBe(
      false,
    );
  });

  it('unscheduleCancellation on an unknown id throws rather than fabricating a record', async () => {
    const provider = new FakeBillingProvider();

    await expect(
      provider.unscheduleCancellation('does-not-exist'),
    ).rejects.toThrow();
  });

  it('getSubscription on an unknown id throws rather than fabricating a record (payment failure / unknown-subscription safety)', async () => {
    const provider = new FakeBillingProvider();

    await expect(provider.getSubscription('does-not-exist')).rejects.toThrow();
  });

  it('advancePeriod (period boundary simulation) moves start/end forward deterministically, never using a real clock', async () => {
    const provider = new FakeBillingProvider();
    const customer = await provider.createCustomer('tenant-a');
    const sub = await provider.createSubscription(
      customer.providerCustomerId,
      'plan-ref-1',
    );

    const advanced = provider.advancePeriod(sub.providerSubscriptionId);

    expect(advanced.currentPeriodStart).toEqual(sub.currentPeriodEnd);
    expect(advanced.currentPeriodEnd.getTime()).toBeGreaterThan(
      advanced.currentPeriodStart.getTime(),
    );
  });

  it('emitDuplicateEvent (duplicate provider-event simulation) re-delivers the identical event object', () => {
    const provider = new FakeBillingProvider();
    const original = {
      providerEventId: 'evt-1',
      type: 'payment_failed',
      payload: {},
    };

    provider.emitDuplicateEvent(original); // first delivery
    const redelivered = provider.emitDuplicateEvent(original); // duplicate delivery

    expect(redelivered).toBe(original);
    expect(provider.getEmittedEvents()).toEqual([original, original]);
  });

  it('verifyWebhook/parseWebhook are interface-level fakes only — no real signature/payload logic', () => {
    const provider = new FakeBillingProvider();
    const event = {
      providerEventId: 'evt-2',
      type: 'activated',
      payload: { ok: true },
    };

    expect(provider.verifyWebhook(Buffer.from('x'), 'any-signature')).toBe(
      true,
    );
    const parsed = provider.parseWebhook(Buffer.from(JSON.stringify(event)));
    expect(parsed).toEqual(event);
  });

  it("state is per-instance — a fresh FakeBillingProvider never sees another instance's fake subscriptions", async () => {
    const providerA = new FakeBillingProvider();
    const providerB = new FakeBillingProvider();
    const customer = await providerA.createCustomer('tenant-a');
    const sub = await providerA.createSubscription(
      customer.providerCustomerId,
      'plan-ref-1',
    );

    await expect(
      providerB.getSubscription(sub.providerSubscriptionId),
    ).rejects.toThrow();
  });
});
