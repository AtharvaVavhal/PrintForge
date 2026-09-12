import { FakeBillingProvider } from '../../test/e2e/support/fake-billing-provider';

/**
 * Phase 7 Stage 1 (docs/saas/DECISIONS.md P7-D1, Part G). Deliberately
 * colocated under `src/subscriptions/` rather than next to
 * `test/e2e/support/fake-billing-provider.ts` itself — same reasoning,
 * same precedent, as `phase6-w1-plan-backfill.spec.ts`/`free-plan
 * -catalogue.spec.ts`: `package.json`'s jest config sets `rootDir: "src"`,
 * so nothing under `test/` is ever discovered by `npx jest` (the unit
 * runner). The module is imported here via relative path; `rootDir` only
 * gates *test discovery*, not what a discovered test may import.
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
