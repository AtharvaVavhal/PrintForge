import { randomUUID } from 'crypto';
import {
  BillingProvider,
  BillingProviderCustomer,
  BillingProviderSubscription,
  NormalizedBillingEvent,
} from '../../../src/subscriptions/billing-provider.interface';

/** A fixed, clearly test-oriented period length — this is a FAKE
 * provider's own deterministic simulation of "how long until the next
 * invoice," not production billing-period logic (that remains
 * provider-confirmed only, per P7-D1 Part E; nothing in
 * `SubscriptionService` ever reads or trusts this constant). */
const FAKE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

interface FakeSubscriptionRecord {
  providerSubscriptionId: string;
  providerCustomerId: string;
  planRef: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelled: boolean;
}

/**
 * Phase 7 Stage 1 (docs/saas/DECISIONS.md P7-D1, Part G) — the
 * deterministic `BillingProvider` test double. Mirrors
 * `fake-cloudinary.service.ts`'s role exactly: no test needs a real
 * vendor account, real network call, or real webhook signature to prove
 * `SubscriptionService`'s own logic. Provider-independent and vendor-
 * neutral by construction — nothing here implies or requires Razorpay,
 * Stripe, or any other specific vendor's concepts; `planRef` is an opaque
 * string, never assumed to be a real `Plan.id` or a vendor price id.
 *
 * In-memory only; state resets whenever a new instance is constructed
 * (one per test, matching this repo's own `beforeEach` reset convention
 * — never a module-level singleton relied on across tests).
 *
 * Test-control hooks beyond the bare `BillingProvider` interface:
 *   - `advancePeriod(providerSubscriptionId)` — deterministically moves a
 *     fake subscription's period boundary forward by `FAKE_PERIOD_MS`,
 *     for period-boundary tests, without any real clock/cron.
 *   - `getEmittedEvents()` / `emitDuplicateEvent(event)` — a fake
 *     "duplicate webhook delivery" is exactly the same
 *     `NormalizedBillingEvent` object handed to the caller a second time;
 *     `SubscriptionService`'s own idempotency (same `providerEventId`,
 *     same target state) is what a test actually asserts against, this
 *     class only needs to make replay trivial to express.
 */
export class FakeBillingProvider implements BillingProvider {
  private readonly subscriptions = new Map<string, FakeSubscriptionRecord>();
  private readonly emittedEvents: NormalizedBillingEvent[] = [];

  createCustomer(tenantId: string): Promise<BillingProviderCustomer> {
    void tenantId; // interface-required, unused by this fake
    return Promise.resolve({ providerCustomerId: `fake-cust-${randomUUID()}` });
  }

  createSubscription(
    providerCustomerId: string,
    planRef: string,
  ): Promise<BillingProviderSubscription> {
    const now = new Date();
    const record: FakeSubscriptionRecord = {
      providerSubscriptionId: `fake-sub-${randomUUID()}`,
      providerCustomerId,
      planRef,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + FAKE_PERIOD_MS),
      cancelled: false,
    };
    this.subscriptions.set(record.providerSubscriptionId, record);
    return Promise.resolve(this.toProviderSubscription(record));
  }

  // Declared `async` (not a bare `Promise.resolve(...)` return) so that
  // `getOrThrow`'s synchronous throw is captured into a REJECTED promise,
  // never a synchronous exception — an interface consumer that does
  // `await expect(provider.foo()).rejects.toThrow()` must see a rejection,
  // exactly like a real async provider call would produce, never a throw
  // before the call even returns a promise. No real `await` is needed
  // (a fake has no actual I/O) — `async` alone already gives the correct
  // rejection semantics.
  // eslint-disable-next-line @typescript-eslint/require-await
  async changeSubscription(
    providerSubscriptionId: string,
    newPlanRef: string,
    mode: 'immediate' | 'at_period_end',
  ): Promise<BillingProviderSubscription> {
    void mode; // interface-required; this fake applies the change the same way regardless
    const record = this.getOrThrow(providerSubscriptionId);
    record.planRef = newPlanRef;
    return this.toProviderSubscription(record);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async cancelSubscription(
    providerSubscriptionId: string,
    mode: 'immediate' | 'at_period_end',
  ): Promise<void> {
    void mode; // interface-required; this fake cancels the same way regardless
    const record = this.getOrThrow(providerSubscriptionId);
    record.cancelled = true;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async resumeSubscription(
    providerSubscriptionId: string,
  ): Promise<BillingProviderSubscription> {
    const record = this.getOrThrow(providerSubscriptionId);
    record.cancelled = false;
    return this.toProviderSubscription(record);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSubscription(
    providerSubscriptionId: string,
  ): Promise<BillingProviderSubscription> {
    return this.toProviderSubscription(this.getOrThrow(providerSubscriptionId));
  }

  /** Fake — always accepts. No real signature verification exists
   * anywhere in Stage 1 (P7-D1 Part H). */
  verifyWebhook(rawBody: Buffer, signature: string): boolean {
    void rawBody; // interface-required, unused by this fake
    void signature;
    return true;
  }

  /** Fake — trivially parses a JSON `{providerEventId, type, payload}`
   * buffer. No real provider payload format is implemented. */
  parseWebhook(rawBody: Buffer): NormalizedBillingEvent {
    const parsed = JSON.parse(
      rawBody.toString('utf8'),
    ) as NormalizedBillingEvent;
    this.emittedEvents.push(parsed);
    return parsed;
  }

  /** Deterministically advances a fake subscription's period boundary —
   * the test's stand-in for "the provider says a new billing period has
   * started," never a real clock. */
  advancePeriod(providerSubscriptionId: string): BillingProviderSubscription {
    const record = this.getOrThrow(providerSubscriptionId);
    record.currentPeriodStart = record.currentPeriodEnd;
    record.currentPeriodEnd = new Date(
      record.currentPeriodStart.getTime() + FAKE_PERIOD_MS,
    );
    return this.toProviderSubscription(record);
  }

  getEmittedEvents(): readonly NormalizedBillingEvent[] {
    return this.emittedEvents;
  }

  /** Re-delivers the exact same event object — a fake "duplicate webhook."
   * `SubscriptionService`'s own idempotency (same `providerEventId`,
   * already-applied target state) is what actually gets tested; this is
   * just how a test expresses "the provider sent this twice." */
  emitDuplicateEvent(event: NormalizedBillingEvent): NormalizedBillingEvent {
    this.emittedEvents.push(event);
    return event;
  }

  private getOrThrow(providerSubscriptionId: string): FakeSubscriptionRecord {
    const record = this.subscriptions.get(providerSubscriptionId);
    if (!record) {
      throw new Error(
        `FakeBillingProvider: no fake subscription "${providerSubscriptionId}"`,
      );
    }
    return record;
  }

  private toProviderSubscription(
    record: FakeSubscriptionRecord,
  ): BillingProviderSubscription {
    return {
      providerSubscriptionId: record.providerSubscriptionId,
      currentPeriodStart: record.currentPeriodStart,
      currentPeriodEnd: record.currentPeriodEnd,
    };
  }
}
