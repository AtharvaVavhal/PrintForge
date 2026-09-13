import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { AppConfig } from '../common/config/configuration';
import {
  BillingProvider,
  BillingProviderCustomer,
  BillingProviderSubscription,
  NormalizedBillingEvent,
} from './billing-provider.interface';
import {
  BillingProviderRejectedError,
  BillingProviderTimeoutError,
} from './billing-provider.errors';

/**
 * Phase 7 — production SaaS billing provider (docs/saas/DECISIONS.md
 * P7-D4 Part A/C, P7-D5). Implements `BillingProvider` for PrintForge's
 * OWN SaaS subscription billing — Merchant -> PrintForge -> Razorpay
 * Subscriptions — completely separate from the Phase 8 merchant-commerce
 * Razorpay integration (`src/payments/razorpay/`). This file imports
 * NOTHING from `payments/`; the two integrations share only the third-
 * party `razorpay` npm package (a stateless generic API client — two
 * independently-configured `Razorpay` instances, two separate accounts,
 * two separate credential pairs) and, where genuinely identical, an
 * INDEPENDENTLY REIMPLEMENTED pattern (SDK error-shape translation,
 * webhook verification) — never shared code, never a shared secret
 * (P7-D4 Part E/F; enforced mechanically by
 * `money-flow-separation.spec.ts`).
 *
 * Every method below is a pure adapter: it translates Razorpay's own
 * request/response shapes into this codebase's already-vendor-neutral
 * `BillingProviderCustomer`/`BillingProviderSubscription`/
 * `NormalizedBillingEvent` contracts and back. No Razorpay-specific
 * concept (subscription status vocabulary, `cancel_at_cycle_end`,
 * `schedule_change_at`, webhook event names) leaks past this file —
 * `SubscriptionService`/`SubscriptionOrchestrationService`/the state
 * machine remain exactly as they were before this file existed.
 */
/**
 * A narrow, verified subset of the Razorpay SDK's own `Subscriptions
 * .RazorpaySubscription` response shape — only the fields this adapter
 * actually reads (`id`, `status`, `plan_id`, `current_start`,
 * `current_end`). NOT derived via the `Awaited<ReturnType<...>>`
 * convention `RazorpayService` (merchant commerce) uses for
 * `client.orders.fetchPayments`: the installed SDK's own
 * `subscriptions.d.ts` declares `fetch`/`update`/`resume`/`cancel`/etc.
 * with the Promise-returning overload FIRST and a callback-style overload
 * SECOND, and TypeScript's `ReturnType` on an overloaded function type
 * always resolves using the LAST signature — here, the callback overload
 * (`=> void`), not the Promise one. (`orders.d.ts`'s `fetchPayments`
 * declares its two overloads in the opposite order — callback first,
 * Promise last — which is why that same convention happens to typecheck
 * there.) A hand-written, narrow interface sidesteps this SDK-specific
 * overload-declaration-order footgun entirely, and matches this file's
 * own `RazorpaySubscriptionWebhookPayload` precedent below (deliberately
 * narrow, never the full vendor entity shape). Every real Razorpay
 * subscription response structurally satisfies this narrower shape. */
interface RazorpaySubscriptionRecord {
  id: string;
  status: string;
  plan_id: string;
  current_start?: number | null;
  current_end?: number | null;
}

@Injectable()
export class RazorpayBillingProvider implements BillingProvider, OnModuleInit {
  private readonly logger = new Logger(RazorpayBillingProvider.name);
  private client: Razorpay | undefined;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    const config = this.configService.get('razorpaySaas', { infer: true });
    if (!config.keyId || !config.keySecret) {
      // Same "warn, don't crash boot" discipline as the merchant
      // RazorpayService — other parts of the app (auth, catalog, etc.)
      // must be able to start with SaaS billing unconfigured. Any method
      // below that actually needs the client fails loudly, at call time,
      // via getClient().
      this.logger.warn(
        'RAZORPAY_SAAS_KEY_ID/RAZORPAY_SAAS_KEY_SECRET not set — Razorpay SaaS billing client not initialized. Subscription mutation endpoints will fail until configured.',
      );
      return;
    }
    this.client = new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret,
    });
  }

  /** Every method that needs the Razorpay SDK must go through this —
   * "not configured" fails at the point of use, never at boot. Never
   * logs the key/secret values themselves. */
  private getClient(): Razorpay {
    if (!this.client) {
      throw new Error(
        'Razorpay SaaS billing client is not configured — set RAZORPAY_SAAS_KEY_ID and RAZORPAY_SAAS_KEY_SECRET.',
      );
    }
    return this.client;
  }

  // ─── createCustomer / createSubscription ─────────────────────────────
  //
  // NOT reachable by any current HTTP route (`SubscriptionOrchestrationService
  // .createSubscription()` is, by its own header comment, "NOT wired to a
  // dedicated HTTP route" — a tenant's first Subscription row today still
  // comes from `seed-tenant-bootstrap.ts`). Implemented faithfully to the
  // interface regardless, but two real Razorpay-specific constraints are
  // disclosed here rather than papered over (readiness-audit findings,
  // verified against the installed `razorpay` SDK's own type definitions):
  //
  //   1. Razorpay's `POST /customers` and `POST /subscriptions` are two
  //      independent calls with NO `customer_id` field on the subscription
  //      create body at all (confirmed: `RazorpaySubscriptionBaseRequestBody`
  //      has no such field) — Razorpay populates `customer_id` on the
  //      subscription automatically, only once a customer completes the
  //      authorization transaction at the subscription's own `short_url`.
  //      This method still calls `createCustomer` conceptually (the
  //      interface requires accepting `providerCustomerId`) but cannot
  //      forward it to Razorpay's create-subscription call — there is
  //      nowhere to put it. The real customer linkage happens later,
  //      asynchronously, outside this method's control.
  //   2. Razorpay requires a FINITE `total_count` (billing-cycle count) on
  //      every subscription — there is no "runs forever" option in this
  //      SDK's own request type. `LONG_HORIZON_YEARS` below simulates
  //      perpetual billing with a long-but-finite horizon, isolated
  //      entirely inside this adapter (readiness-audit-approved strategy)
  //      — `SubscriptionService`/the state machine never know this exists.
  //      `subscription.completed` (the Razorpay event that would fire if
  //      this horizon is ever actually exhausted) is deliberately a safe
  //      no-op in `parseWebhook()` below, not a crash.
  //
  // A genuinely new subscription is NOT yet `active` in Razorpay's own
  // model until that authorization completes — `toProviderSubscription()`
  // below throws rather than inventing a period for a `created`-status
  // subscription, so this method fails loudly (never with fabricated
  // dates) if called before a real onboarding/checkout flow exists to
  // complete that authorization step. That flow is separate, later,
  // explicitly-authorized work.

  async createCustomer(tenantId: string): Promise<BillingProviderCustomer> {
    const client = this.getClient();
    try {
      const customer = await client.customers.create({
        notes: { tenantId },
      });
      return { providerCustomerId: customer.id };
    } catch (err) {
      throw this.translateSdkError('createCustomer', err);
    }
  }

  async createSubscription(
    providerCustomerId: string,
    planRef: string,
  ): Promise<BillingProviderSubscription> {
    // Accepted per the interface contract; see this section's own header
    // comment for why it cannot be forwarded to Razorpay's create call.
    void providerCustomerId;
    const client = this.getClient();
    let created: RazorpaySubscriptionRecord;
    try {
      const plan = await client.plans.fetch(planRef);
      const totalCount = computeLongHorizonTotalCount(
        plan.period,
        plan.interval,
      );
      created = await client.subscriptions.create({
        plan_id: planRef,
        total_count: totalCount,
      });
    } catch (err) {
      throw this.translateSdkError('createSubscription', err);
    }
    // Outside the try/catch above — a "no confirmed period yet" data-shape
    // issue (see toProviderSubscription's own comment) is not a transport
    // failure and must never be reported as one.
    return this.toProviderSubscription(created);
  }

  // ─── changeSubscription (upgrade/downgrade) ──────────────────────────

  async changeSubscription(
    providerSubscriptionId: string,
    newPlanRef: string,
    mode: 'immediate' | 'at_period_end',
  ): Promise<BillingProviderSubscription> {
    const client = this.getClient();
    let updated: RazorpaySubscriptionRecord;
    try {
      updated = await client.subscriptions.update(providerSubscriptionId, {
        plan_id: newPlanRef,
        schedule_change_at: mode === 'immediate' ? 'now' : 'cycle_end',
      });
      updated = await this.ensureConfirmedPeriod(updated);
    } catch (err) {
      throw this.translateSdkError('changeSubscription', err);
    }
    return this.toProviderSubscription(updated);
  }

  // ─── cancelSubscription ───────────────────────────────────────────────
  //
  // docs/saas/DECISIONS.md P7-D5 Parts A/B — sandbox-verified: Razorpay
  // exposes no safe way to reverse a `cancel_at_cycle_end: true`
  // cancellation while keeping the subscription active (re-calling
  // `cancel` with `false` does not undo it — it immediately, destructively
  // cancels instead). For an `'at_period_end'` request, this method
  // therefore makes NO Razorpay call at all — it returns successfully so
  // the existing, unmodified `SubscriptionOrchestrationService
  // .scheduleCancellationFlow()` -> `SubscriptionService
  // .scheduleCancellation()` call chain still runs exactly as before,
  // setting only the LOCAL `Subscription.cancelAtPeriodEnd` flag. The real
  // Razorpay subscription remains genuinely, uninterrupted active until
  // `SubscriptionOrchestrationService.reconcilePeriod()` reaches the
  // confirmed boundary and calls this method again with `'immediate'`
  // (P7-D5 Part D).

  async cancelSubscription(
    providerSubscriptionId: string,
    mode: 'immediate' | 'at_period_end',
  ): Promise<void> {
    if (mode === 'at_period_end') {
      // P7-D5 Part B — deliberately no provider call. See header comment.
      return;
    }
    const client = this.getClient();
    try {
      await client.subscriptions.cancel(providerSubscriptionId, false);
    } catch (err) {
      throw this.translateSdkError('cancelSubscription', err);
    }
  }

  // ─── unscheduleCancellation ───────────────────────────────────────────
  //
  // docs/saas/DECISIONS.md P7-D5 Part C — local-only. Since Part B above
  // never told Razorpay about the scheduled cancellation in the first
  // place, there is nothing provider-side to undo — this method makes NO
  // Razorpay mutation call. It performs a plain, read-only `getSubscription`
  // -equivalent fetch so the returned `BillingProviderSubscription` is
  // real, provider-confirmed data (never fabricated), matching every other
  // method's own "do not invent dates" discipline, while guaranteeing (by
  // construction — no mutation call exists in this method) that it can
  // never accidentally call `cancel(..., false)` (destructive),
  // `resume()` (wrong operation — no pause occurred), or
  // `cancel_scheduled_changes` (wrong domain — pending PLAN changes only,
  // sandbox-confirmed via `"No Pending update for this subscription"`).

  async unscheduleCancellation(
    providerSubscriptionId: string,
  ): Promise<BillingProviderSubscription> {
    const client = this.getClient();
    try {
      const current = await client.subscriptions.fetch(providerSubscriptionId);
      return this.toProviderSubscription(current);
    } catch (err) {
      throw this.translateSdkError('unscheduleCancellation', err);
    }
  }

  // ─── resumeSubscription ───────────────────────────────────────────────
  //
  // For a genuinely `paused` (or, via `applyResumeTransition`'s own
  // `reactivate()` path, `cancelled`-then-reactivated in this repository's
  // own state-machine terms) Razorpay subscription — NEVER used to
  // "unschedule" an active subscription's cycle-end cancellation (P7-D5
  // Part C explicitly forbids that; sandbox-confirmed Razorpay itself
  // refuses `resume` on an `active`-status subscription regardless of
  // whether a cancellation is scheduled: `"subscription can't be resumed
  // as subscription is in active state"`).

  async resumeSubscription(
    providerSubscriptionId: string,
  ): Promise<BillingProviderSubscription> {
    const client = this.getClient();
    try {
      const resumed = await client.subscriptions.resume(
        providerSubscriptionId,
        { resume_at: 'now' },
      );
      return this.toProviderSubscription(
        await this.ensureConfirmedPeriod(resumed),
      );
    } catch (err) {
      throw this.translateSdkError('resumeSubscription', err);
    }
  }

  // ─── getSubscription ──────────────────────────────────────────────────

  async getSubscription(
    providerSubscriptionId: string,
  ): Promise<BillingProviderSubscription> {
    const client = this.getClient();
    try {
      const sub = await client.subscriptions.fetch(providerSubscriptionId);
      return this.toProviderSubscription(sub);
    } catch (err) {
      throw this.translateSdkError('getSubscription', err);
    }
  }

  // ─── Webhook verification / parsing ───────────────────────────────────
  //
  // docs/saas/DECISIONS.md P7-D5 Part E. Uses the Razorpay SDK's OWN
  // `validateWebhookSignature` static utility (HMAC-SHA256 of the exact
  // raw body against the SaaS-specific webhook secret, constant-time
  // compare internally) — never a hand-rolled reimplementation, and never
  // shared code with `RazorpayService.verifyWebhookSignature()` (merchant
  // commerce) even though both ultimately call the same SDK utility with
  // two entirely separate secrets. Operates on the EXACT raw bytes — never
  // parses/re-stringifies first.

  verifyWebhook(rawBody: Buffer, signature: string): boolean {
    const config = this.configService.get('razorpaySaas', { infer: true });
    if (!config.webhookSecret) {
      throw new Error(
        'RAZORPAY_SAAS_WEBHOOK_SECRET is not configured — cannot verify SaaS billing webhook signatures.',
      );
    }
    if (!signature) {
      return false;
    }
    try {
      return Razorpay.validateWebhookSignature(
        rawBody.toString('utf8'),
        signature,
        config.webhookSecret,
      );
    } catch {
      // Malformed signature input -> fail closed, never throw past this
      // boundary (a throw here would surface as a 500, not the intended
      // "invalid signature" 400 `BillingWebhookIngestionService` already
      // produces for a `false` return).
      return false;
    }
  }

  /**
   * docs/saas/DECISIONS.md P7-D5 Part E — `headerEventId` (Razorpay's
   * `X-Razorpay-Event-Id`, extracted by `BillingWebhooksController`) is
   * used as `providerEventId` WHENEVER present — empirically confirmed
   * (a live-captured `subscription.cancelled` delivery) that Razorpay's
   * JSON payload body carries no `id`/`event_id` field of its own. The
   * payload-derived fallback below exists ONLY for the defensive case
   * where the header is somehow absent (mirrors
   * `PaymentsService.extractWebhookEventId()`'s own disclosed fallback
   * for the merchant commerce webhook) — the header is never ignored in
   * favor of this fallback when it is present.
   *
   * `subscription.charged` always maps to the SAME canonical `'renewed'`
   * type regardless of the local subscription's current status —
   * Razorpay has no distinct "recovered" event (confirmed: a successful
   * retry after a prior failure and an ordinary periodic renewal are the
   * identical `subscription.charged` event). Disambiguating PAST_DUE
   * (-> `recoverPayment()`) from ACTIVE (-> `confirmRenewal()`) requires
   * the LOCAL subscription's current status, which this method — a pure
   * function of the raw payload — cannot see; that branch lives in
   * `BillingWebhookProcessor` instead (P7-D5 Part E/§4), exactly where
   * the existing `RENEWAL_EVENT_TYPE` special-case already lives.
   */
  parseWebhook(
    rawBody: Buffer,
    headerEventId?: string,
  ): NormalizedBillingEvent {
    let payload: RazorpaySubscriptionWebhookPayload;
    try {
      payload = JSON.parse(
        rawBody.toString('utf8'),
      ) as RazorpaySubscriptionWebhookPayload;
    } catch {
      throw new Error('Malformed Razorpay webhook payload');
    }

    const subscriptionEntity = payload.payload?.subscription?.entity;
    const providerEventId =
      headerEventId && headerEventId.trim().length > 0
        ? headerEventId.trim()
        : `${payload.event}:${subscriptionEntity?.id ?? 'unknown'}:${payload.created_at ?? ''}`;

    const type = mapRazorpayEventType(payload.event);
    const occurredAt =
      typeof payload.created_at === 'number'
        ? new Date(payload.created_at * 1000).toISOString()
        : undefined;

    const normalizedPayload: Record<string, unknown> = {
      providerSubscriptionId: subscriptionEntity?.id,
      providerCustomerId: subscriptionEntity?.customer_id ?? undefined,
      occurredAt,
    };
    // Period boundaries are only meaningful (and only ever present) on the
    // renewal path — never invented for any other event type.
    if (
      type === RENEWAL_CANONICAL_TYPE &&
      typeof subscriptionEntity?.current_start === 'number' &&
      typeof subscriptionEntity?.current_end === 'number'
    ) {
      normalizedPayload.currentPeriodStart = new Date(
        subscriptionEntity.current_start * 1000,
      ).toISOString();
      normalizedPayload.currentPeriodEnd = new Date(
        subscriptionEntity.current_end * 1000,
      ).toISOString();
    }

    return {
      providerEventId,
      type,
      payload: normalizedPayload,
    };
  }

  // ─── Shared helpers ───────────────────────────────────────────────────

  /**
   * `PATCH`/`resume` responses are not guaranteed (by the SDK's own type
   * definitions) to carry complete, non-null `current_start`/`current_end`
   * — rather than ever substituting a locally-computed date, this performs
   * one authoritative follow-up `GET` whenever either is missing. A no-op
   * extra round trip on the common case where the response is already
   * complete.
   */
  private async ensureConfirmedPeriod(
    sub: RazorpaySubscriptionRecord,
  ): Promise<RazorpaySubscriptionRecord> {
    if (sub.current_start != null && sub.current_end != null) {
      return sub;
    }
    const client = this.getClient();
    try {
      return await client.subscriptions.fetch(sub.id);
    } catch (err) {
      throw this.translateSdkError('ensureConfirmedPeriod', err);
    }
  }

  /** Never invents a period. A subscription with no confirmed
   * `current_start`/`current_end` (e.g. `created`, not yet authorized —
   * see `createSubscription`'s own header comment) has nothing authentic
   * to report; this throws rather than fabricating one. */
  private toProviderSubscription(
    sub: RazorpaySubscriptionRecord,
  ): BillingProviderSubscription {
    if (sub.current_start == null || sub.current_end == null) {
      throw new Error(
        `Razorpay subscription ${sub.id} has no provider-confirmed billing period yet (status=${sub.status}) — cannot report currentPeriodStart/End without inventing one.`,
      );
    }
    return {
      providerSubscriptionId: sub.id,
      currentPeriodStart: new Date(sub.current_start * 1000),
      currentPeriodEnd: new Date(sub.current_end * 1000),
      planRef: sub.plan_id,
    };
  }

  /**
   * Translates whatever the Razorpay SDK throws into the two-bucket
   * contract `SubscriptionOrchestrationService` relies on
   * (`billing-provider.errors.ts`'s own doc comment) — independently
   * reimplemented from, never shared with,
   * `RazorpayService.translateSdkError()` (merchant commerce), since both
   * classes must never import from one another (invariant 6).
   *
   * A real API error (the SDK's `{ statusCode, error: { code,
   * description } }` shape) with `statusCode` in the 4xx range is a
   * genuine business rejection — `BillingProviderRejectedError`. A 5xx, or
   * any transport-level failure (no response at all — DNS/TLS/timeout, or
   * this SDK version's own known `normalizeError` bug that mangles a
   * response-less rejection into `TypeError: Cannot read properties of
   * undefined (reading 'status')`), is treated as ambiguous — the
   * operation may or may not have applied — via
   * `BillingProviderTimeoutError`, routing the caller to
   * `getSubscription()`-based reconciliation rather than a blind retry
   * (docs/saas/DECISIONS.md P7-D2 Part E: reconcile first, never guess).
   */
  private translateSdkError(op: string, err: unknown): Error {
    if (
      typeof err === 'object' &&
      err !== null &&
      'statusCode' in err &&
      typeof (err as { statusCode?: unknown }).statusCode === 'number'
    ) {
      const e = err as {
        statusCode: number;
        error?: { code?: string; description?: string };
      };
      const desc = e.error?.description ?? 'no description';
      this.logger.error(
        `RazorpayBillingProvider.${op} rejected: HTTP ${e.statusCode}${
          e.error?.code ? ` code=${e.error.code}` : ''
        } — ${desc}`,
      );
      if (e.statusCode >= 500) {
        return new BillingProviderTimeoutError(
          `Razorpay SaaS billing ${op}: server error HTTP ${e.statusCode} — outcome unknown`,
        );
      }
      return new BillingProviderRejectedError(desc);
    }

    const raw = err as
      { code?: unknown; message?: unknown; name?: unknown } | undefined;
    const netCode = typeof raw?.code === 'string' ? raw.code : undefined;
    const mangled =
      raw?.name === 'TypeError' &&
      typeof raw.message === 'string' &&
      raw.message.includes("reading 'status'");
    const detail =
      netCode ??
      (mangled
        ? 'no response from Razorpay'
        : typeof raw?.message === 'string'
          ? raw.message
          : 'unknown transport error');
    this.logger.error(
      `RazorpayBillingProvider.${op} could not reach the API: ${detail}`,
    );
    return new BillingProviderTimeoutError(
      `Razorpay SaaS billing ${op} failed: could not reach Razorpay (${detail})`,
    );
  }
}

// ─── Module-private helpers (isolated inside this adapter) ───────────────

/**
 * Razorpay requires every subscription to declare a finite `total_count`
 * — there is no "renews forever" option (confirmed via the installed SDK's
 * own request type, which declares `total_count: number` with no
 * alternative). Simulates perpetual billing with a long-but-finite
 * horizon; isolated entirely inside this adapter, per the readiness
 * audit's own approved strategy — `SubscriptionService`/the state machine
 * never know this constant exists. 20 years (not the 100 originally
 * considered) is used deliberately conservatively, since Razorpay's own
 * maximum accepted `total_count` value is undocumented — verify against a
 * real sandbox call before relying on a longer horizon.
 */
const LONG_HORIZON_YEARS = 20;
const CYCLES_PER_YEAR: Record<string, number> = {
  daily: 365,
  weekly: 52,
  monthly: 12,
  yearly: 1,
};

function computeLongHorizonTotalCount(
  period: string,
  interval: number,
): number {
  const perYear = CYCLES_PER_YEAR[period] ?? 12;
  const safeInterval = interval > 0 ? interval : 1;
  return Math.max(1, Math.round((perYear * LONG_HORIZON_YEARS) / safeInterval));
}

/** This codebase's own canonical, vendor-neutral event-type vocabulary
 * (matching `SubscriptionService.applyBillingWebhookEvent`'s recognized
 * cases plus `BillingWebhookProcessor`'s own `'renewed'` special case) —
 * the same literal-string convention `FakeBillingProvider
 * .buildWebhookEventBody()` already establishes, not a shared exported
 * constant (keeping the adapter and the processor decoupled). */
const RENEWAL_CANONICAL_TYPE = 'renewed';

/**
 * Razorpay Subscriptions webhook event name -> this codebase's canonical
 * vocabulary (docs/saas/DECISIONS.md P7-D5 §7, sandbox/documentation
 * verified this session — no event name or payload field here is
 * invented):
 *   - `subscription.pending` (a charge failed, retries beginning) ->
 *     `'payment_failed'`.
 *   - `subscription.charged` -> `'renewed'` always; `BillingWebhookProcessor`
 *     is responsible for routing to `recoverPayment()` instead of
 *     `confirmRenewal()` when the local subscription is currently
 *     PAST_DUE (see this file's own `parseWebhook()` doc comment).
 *   - `subscription.cancelled` -> `'cancelled'`.
 *   - Everything else (`subscription.activated`, `subscription.
 *     authenticated`, `subscription.halted`, `subscription.completed`,
 *     `subscription.paused`, `subscription.resumed`, `subscription.
 *     updated`, and any future Razorpay event this adapter does not yet
 *     recognize) is passed through as its own raw Razorpay event string —
 *     neither `SubscriptionService.applyBillingWebhookEvent()`'s switch
 *     nor `BillingWebhookProcessor`'s renewal special-case recognizes any
 *     of these, so they fall to the existing, already-safe default no-op
 *     rather than an invented lifecycle transition. `subscription.
 *     activated` is deliberately NOT wired to a real transition here:
 *     `confirmActivation()` has no current webhook-reachable call path
 *     (readiness-audit finding — initial subscription creation has no
 *     live HTTP caller today), so mapping it to a recognized type would
 *     silently do nothing useful anyway.
 */
function mapRazorpayEventType(razorpayEvent: string): string {
  switch (razorpayEvent) {
    case 'subscription.pending':
      return 'payment_failed';
    case 'subscription.charged':
      return RENEWAL_CANONICAL_TYPE;
    case 'subscription.cancelled':
      return 'cancelled';
    default:
      return razorpayEvent;
  }
}

/**
 * Minimal, vendor-specific shape this adapter reads from a Razorpay
 * Subscriptions webhook body — verified this session against a real,
 * live-captured delivery (docs/saas/DECISIONS.md P7-D5 Part H), not
 * assumed from documentation alone. Deliberately narrow (only the fields
 * this adapter actually reads) — never the full Razorpay entity shape.
 */
interface RazorpaySubscriptionWebhookPayload {
  event: string;
  /** Unix seconds. */
  created_at?: number;
  payload?: {
    subscription?: {
      entity?: {
        id?: string;
        customer_id?: string | null;
        /** Unix seconds. */
        current_start?: number | null;
        /** Unix seconds. */
        current_end?: number | null;
      };
    };
  };
}
