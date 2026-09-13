import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  BillingProvider,
  BillingProviderCustomer,
  BillingProviderSubscription,
  NormalizedBillingEvent,
} from './billing-provider.interface';

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
  /** Phase 7 — Cancellation Retention + Unscheduling wave. Distinct from
   * `cancelled` above: this tracks an at-period-end cancellation that has
   * been requested but not yet taken effect (the subscription remains
   * otherwise fully active) — never surfaced via `getSubscription()`'s
   * own `BillingProviderSubscription` return shape (deliberately; see
   * `unscheduleCancellation`'s own interface doc comment and P7-D2/P7-D3's
   * "do not invent a provider-specific confirmation field" instruction),
   * purely internal bookkeeping so this fake can model
   * `unscheduleCancellation` meaningfully for tests. */
  cancellationScheduled: boolean;
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
 * **Relocated from `test/e2e/support/` to `src/subscriptions/` in Phase 7
 * Stage 2 (P7-D2 Part G).** Unlike `FakeCloudinaryService` (whose real
 * counterpart, `CloudinaryService`, already exists and is what production
 * actually binds — the fake is purely a test-time DI override), no real
 * `BillingProvider` adapter exists yet and Stage 2 is explicitly
 * forbidden from building one (production billing-provider selection,
 * P7-D1 Part G, remains OPEN). `SubscriptionModule` therefore binds the
 * `BILLING_PROVIDER` DI token (`billing-provider.token.ts`) to THIS class
 * for the real, running application too, not only for tests — exactly
 * what P7-D2 Part G ratifies ("Stage 2 will bind BillingProvider ->
 * FakeBillingProvider ... to make the vendor-independent Stage 2
 * implementation executable and testable... NOT ... selecting
 * FakeBillingProvider as the production billing provider"). Living under
 * `src/` (rather than `test/`) is what makes that real-module binding
 * possible at all — a file under `test/` is excluded from
 * `tsconfig.build.json` and cannot be imported by real `nest build`
 * output. `@Injectable()` is added (Stage 1's copy had none, since it was
 * only ever constructed directly by tests) so Nest's DI container can
 * instantiate it as an ordinary provider.
 *
 * In-memory only; state resets whenever a new instance is constructed
 * (one per test, matching this repo's own `beforeEach` reset convention
 * — never a module-level singleton relied on across tests). In the real
 * running app, `SubscriptionModule` provides exactly one instance (Nest's
 * default singleton scope) — acceptable ONLY because this remains a fake
 * with no real billing consequence; a real adapter replacing this binding
 * would not inherit this in-memory-singleton shape, since it would hold
 * no local state at all (every call would be a genuine network request).
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
@Injectable()
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
      cancellationScheduled: false,
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
    const record = this.getOrThrow(providerSubscriptionId);
    if (mode === 'at_period_end') {
      record.cancellationScheduled = true;
    } else {
      record.cancelled = true;
    }
  }

  /** Phase 7 — Cancellation Retention + Unscheduling wave. Withdraws a
   * scheduled at-period-end cancellation; a no-op (never throws) if
   * nothing was scheduled, matching this fake's own general tolerance
   * elsewhere (e.g. `resumeSubscription` unconditionally clears
   * `cancelled` regardless of whether it was set). The orchestration
   * layer's own local check (`cancelAtPeriodEnd === true`) is what
   * normally prevents this from being called needlessly in the first
   * place — this fake does not depend on that caller discipline to stay
   * correct. */
  // eslint-disable-next-line @typescript-eslint/require-await
  async unscheduleCancellation(
    providerSubscriptionId: string,
  ): Promise<BillingProviderSubscription> {
    const record = this.getOrThrow(providerSubscriptionId);
    record.cancellationScheduled = false;
    return this.toProviderSubscription(record);
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

  /** Test-control hook (Phase 7 — Cancellation Retention + Unscheduling
   * wave) — lets a test assert on the PROVIDER's own internal
   * bookkeeping directly (e.g. "did `cancelSubscription(..., 'at_period_
   * end')` actually schedule it, and did `unscheduleCancellation`
   * actually clear it"), without needing a corresponding field on the
   * public `BillingProviderSubscription` shape (which deliberately does
   * not expose this — see `FakeSubscriptionRecord.cancellationScheduled`'s
   * own comment). */
  isCancellationScheduled(providerSubscriptionId: string): boolean {
    return this.getOrThrow(providerSubscriptionId).cancellationScheduled;
  }

  /** Re-delivers the exact same event object — a fake "duplicate webhook."
   * `SubscriptionService`'s own idempotency (same `providerEventId`,
   * already-applied target state) is what actually gets tested; this is
   * just how a test expresses "the provider sent this twice." */
  emitDuplicateEvent(event: NormalizedBillingEvent): NormalizedBillingEvent {
    this.emittedEvents.push(event);
    return event;
  }

  /**
   * Phase 7 — D7 SaaS Billing Webhooks wave. Deterministic, vendor-neutral
   * raw webhook body builder — NOT a Razorpay/Stripe/etc. payload shape.
   * Produces exactly the bytes `verifyWebhook`/`parseWebhook` above expect
   * (a JSON `{providerEventId, type, payload}` envelope): a real
   * `BillingProvider` adapter's own `parseWebhook()` would need to
   * normalize a real vendor's payload INTO this same shape (see
   * `billing-webhook-processor.service.ts`'s own header comment for the
   * minimal `payload` envelope — `providerSubscriptionId` /
   * `providerCustomerId` / `occurredAt` — that processor expects); this
   * fake, having no real vendor to translate from, emits that
   * already-normalized shape directly.
   *
   * `type` uses this codebase's own canonical, vendor-neutral event-type
   * vocabulary (`'payment_failed' | 'recovered' | 'cancelled' | 'renewed'`,
   * matching `SubscriptionService.applyBillingWebhookEvent`'s own
   * recognized cases plus `BillingWebhookProcessor`'s own `'renewed'`
   * special-case — Phase 7, Wave A) — never a real vendor's event name.
   * `providerEventId` defaults to a fresh, deterministically-prefixed id
   * (same `fake-*-` convention as `providerCustomerId`/
   * `providerSubscriptionId` above) but can be supplied explicitly so a
   * test can re-emit the identical id for a duplicate-delivery case, and
   * `occurredAt` defaults to "now" but can be supplied explicitly (e.g. in
   * the past) for a stale/out-of-order case. `currentPeriodStart`/
   * `currentPeriodEnd` (Phase 7, Wave A) are used ONLY by a `'renewed'`
   * event — see `BillingWebhookEnvelope`'s own comment in
   * `billing-webhook-processor.service.ts`.
   */
  buildWebhookEventBody(opts: {
    type: string;
    providerSubscriptionId?: string;
    providerCustomerId?: string;
    providerEventId?: string;
    occurredAt?: Date;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
  }): Buffer {
    const event: NormalizedBillingEvent = {
      providerEventId: opts.providerEventId ?? `fake-evt-${randomUUID()}`,
      type: opts.type,
      payload: {
        providerSubscriptionId: opts.providerSubscriptionId,
        providerCustomerId: opts.providerCustomerId,
        occurredAt: (opts.occurredAt ?? new Date()).toISOString(),
        currentPeriodStart: opts.currentPeriodStart?.toISOString(),
        currentPeriodEnd: opts.currentPeriodEnd?.toISOString(),
      },
    };
    return Buffer.from(JSON.stringify(event), 'utf8');
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
      planRef: record.planRef,
    };
  }
}
