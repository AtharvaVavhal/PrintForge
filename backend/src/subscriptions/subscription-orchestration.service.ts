import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Subscription } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { IdempotencyService } from '../checkout/idempotency/idempotency.service';
import { SubscriptionService } from './subscription.service';
import { BILLING_PROVIDER } from './billing-provider.token';
import type {
  BillingProvider,
  BillingProviderCustomer,
  BillingProviderSubscription,
} from './billing-provider.interface';
import {
  BillingProviderRejectedError,
  BillingProviderTimeoutError,
} from './billing-provider.errors';
import {
  SubscriptionMutationPlanView,
  SubscriptionMutationView,
} from './dto/subscription-mutation-view.interface';
import { UpgradeSubscriptionDto } from './dto/upgrade-subscription.dto';
import { DowngradeSubscriptionDto } from './dto/downgrade-subscription.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';

const UPGRADE_ENDPOINT_ID = 'subscription:upgrade';
const DOWNGRADE_ENDPOINT_ID = 'subscription:downgrade';
const CANCEL_ENDPOINT_ID = 'subscription:cancel';
const RESUME_ENDPOINT_ID = 'subscription:resume';

/**
 * Phase 7 Stage 2 (docs/saas/DECISIONS.md P7-D2) — the tenant-facing
 * subscription-mutation orchestration layer. Coordinates:
 *
 *   tenant request -> BillingProvider -> confirmed provider result -> SubscriptionService
 *
 * This class NEVER writes `Subscription.status`/`planId`/`pendingPlanId`/
 * `cancelAtPeriodEnd` directly, and never constructs a `SubscriptionEvent`
 * — every state mutation goes through an existing (Stage 1) or newly
 * ratified-but-still-`SubscriptionService`-owned (Stage 2, P7-D2 Part C
 * `scheduleCancellation`) method on `SubscriptionService`, which remains
 * the sole authority for subscription persistence/state transitions
 * (Stage 2's own implementation authorization, Step 4: "Do NOT duplicate
 * state-machine logic... Stage 2 orchestrates, Stage 1 remains
 * authoritative"). This class also never imports or calls
 * `EntitlementService` — exactly Stage 1's own posture (P7-D1 Part I),
 * unchanged by Stage 2.
 *
 * Every provider call happens OUTSIDE any Prisma transaction (an external
 * network call must never hold a DB transaction open) — only the
 * idempotency-key CLAIM (a fast, local write) and each
 * `SubscriptionService` method's own writes ever touch a transaction, and
 * never the same one a provider call is also inside.
 */
@Injectable()
export class SubscriptionOrchestrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly idempotencyService: IdempotencyService,
    @Inject(BILLING_PROVIDER) private readonly billingProvider: BillingProvider,
  ) {}

  // ─── Create (Step 5) ────────────────────────────────────────────────────
  //
  // Callable orchestration method — NOT wired to a dedicated HTTP route.
  // The ratified Stage 2 "minimum mutation API surface" (P7-D2, Step 14)
  // lists only upgrade/downgrade/cancel/resume; a tenant's very first
  // Subscription row today still comes from the pre-existing
  // `seed-tenant-bootstrap.ts` path (Phase 1), unchanged by this stage.
  // This method exists so a FUTURE onboarding/checkout flow (a separate,
  // later authorization) has a ready orchestration entry point, exactly
  // the same "provided, not yet routed" posture `SubscriptionModule`
  // itself already had throughout Stage 1.

  async createSubscription(
    tenantId: string,
    planId: string,
  ): Promise<SubscriptionMutationView> {
    // Routed through SubscriptionService.findSubscriptionForTenant (never a
    // raw this.prisma.subscription call here) — subscriptions is one of the
    // six tenancy models tenant-data-access-guard.spec.ts restricts to an
    // explicit allowlist; SubscriptionService's own generic-Client-
    // parameter methods are how every other Stage 1/2 access already
    // reaches this table.
    const existing = await this.subscriptionService.findSubscriptionForTenant(
      this.prisma,
      tenantId,
    );
    if (existing) {
      // Subscription.tenantId is @unique — a tenant has at most one row,
      // ever. Checked here (before any provider call) rather than relying
      // solely on that DB constraint, so a second call never reaches the
      // provider at all for a tenant that already has a subscription.
      throw new ConflictException('Tenant already has a subscription');
    }
    await this.assertPlanExists(planId);

    let customer: BillingProviderCustomer;
    let providerSub: BillingProviderSubscription;
    try {
      customer = await this.billingProvider.createCustomer(tenantId);
      providerSub = await this.billingProvider.createSubscription(
        customer.providerCustomerId,
        planId,
      );
    } catch (err) {
      if (err instanceof BillingProviderTimeoutError) {
        // No `providerSubscriptionId` exists yet to reconcile against —
        // `getSubscription()` has nothing to look up. Reconciling a
        // create-timeout for real would need a provider-side idempotent
        // create (an adapter concern; P7-D2 Part E forbids inventing
        // vendor-specific idempotency semantics here) — until a real
        // adapter exists, a create timeout is always a recoverable error,
        // never a guess.
        throw new ServiceUnavailableException(
          'Could not confirm subscription creation with the billing provider; please retry',
        );
      }
      throw this.classifyProviderError(err);
    }

    // Provider confirmed the create — only now does the local Subscription
    // row come into existence (no optimistic local mutation before this
    // point, per Step 5).
    const created = await this.subscriptionService.createPendingSubscription(
      this.prisma,
      tenantId,
      planId,
    );
    const toStatus = providerSub.trialEndsAt ? 'TRIALING' : 'ACTIVE';
    const result = await this.subscriptionService.confirmActivation(
      this.prisma,
      created,
      {
        toStatus,
        currentPeriodStart: providerSub.currentPeriodStart,
        currentPeriodEnd: providerSub.currentPeriodEnd,
        providerCustomerId: customer.providerCustomerId,
        providerSubscriptionId: providerSub.providerSubscriptionId,
        trialEndsAt: providerSub.trialEndsAt,
      },
    );
    return this.toView(result.subscription);
  }

  // ─── Upgrade (Step 6) ───────────────────────────────────────────────────

  async upgrade(
    tenantId: string,
    userId: string,
    dto: UpgradeSubscriptionDto,
    idempotencyKey: string,
  ): Promise<SubscriptionMutationView> {
    return this.withIdempotency(
      tenantId,
      userId,
      UPGRADE_ENDPOINT_ID,
      idempotencyKey,
      async () => {
        const subscription =
          await this.subscriptionService.getSubscriptionForTenant(
            this.prisma,
            tenantId,
          );
        if (subscription.planId === dto.toPlanId) {
          return subscription; // already on this plan — no provider call needed
        }
        await this.assertPlanExists(dto.toPlanId);
        this.assertHasProviderLink(subscription);
        if (subscription.status !== 'ACTIVE') {
          throw new ConflictException(
            `Subscription must be ACTIVE to upgrade (currently ${subscription.status})`,
          );
        }

        try {
          // never mutate planId before this call returns successfully
          await this.billingProvider.changeSubscription(
            subscription.providerSubscriptionId,
            dto.toPlanId,
            'immediate',
          );
        } catch (err) {
          if (err instanceof BillingProviderTimeoutError) {
            return this.reconcileUpgradeTimeout(subscription, dto.toPlanId);
          }
          throw this.classifyProviderError(err);
        }

        const result = await this.subscriptionService.confirmUpgrade(
          this.prisma,
          subscription,
          { toPlanId: dto.toPlanId },
        );
        return result.subscription;
      },
    );
  }

  private async reconcileUpgradeTimeout(
    subscription: Subscription,
    toPlanId: string,
  ): Promise<Subscription> {
    const providerState = await this.attemptReconciliationRead(subscription);
    if (providerState.planRef === toPlanId) {
      // Provider-confirmed: the plan change DID take effect.
      const result = await this.subscriptionService.confirmUpgrade(
        this.prisma,
        subscription,
        { toPlanId },
      );
      return result.subscription;
    }
    // Still shows the old plan (or an unrecognized one) — cannot establish
    // the upgrade succeeded. Never guess; never blindly retry the mutation.
    throw new ServiceUnavailableException(
      'Could not confirm the upgrade with the billing provider; no local change was made — please retry',
    );
  }

  // ─── Downgrade (Step 7) ─────────────────────────────────────────────────

  async downgrade(
    tenantId: string,
    userId: string,
    dto: DowngradeSubscriptionDto,
    idempotencyKey: string,
  ): Promise<SubscriptionMutationView> {
    return this.withIdempotency(
      tenantId,
      userId,
      DOWNGRADE_ENDPOINT_ID,
      idempotencyKey,
      async () => {
        const subscription =
          await this.subscriptionService.getSubscriptionForTenant(
            this.prisma,
            tenantId,
          );
        if (subscription.pendingPlanId === dto.toPlanId) {
          return subscription; // already scheduled for this exact target
        }
        await this.assertPlanExists(dto.toPlanId);
        this.assertHasProviderLink(subscription);
        if (subscription.status !== 'ACTIVE') {
          throw new ConflictException(
            `Subscription must be ACTIVE to schedule a downgrade (currently ${subscription.status})`,
          );
        }

        try {
          // P7-D2 Part D: call the provider FIRST, require its acceptance —
          // pendingPlanId is only persisted after this call succeeds.
          await this.billingProvider.changeSubscription(
            subscription.providerSubscriptionId,
            dto.toPlanId,
            'at_period_end',
          );
        } catch (err) {
          if (err instanceof BillingProviderTimeoutError) {
            return this.reconcileDowngradeScheduleTimeout(subscription);
          }
          throw this.classifyProviderError(err);
          // Provider rejection: pendingPlanId is never persisted — no local
          // mutation of any kind occurs on this path.
        }

        const result = await this.subscriptionService.scheduleDowngrade(
          this.prisma,
          subscription,
          { pendingPlanId: dto.toPlanId },
        );
        return result.subscription;
      },
    );
  }

  private async reconcileDowngradeScheduleTimeout(
    subscription: Subscription,
  ): Promise<Subscription> {
    // Confirms the provider is at least reachable and still recognizes this
    // subscription — but `BillingProviderSubscription` exposes only the
    // CURRENTLY active period/plan, never "is an at-period-end change
    // scheduled". That specific fact genuinely cannot be confirmed through
    // this interface (a documented, disclosed limitation — see the Stage 2
    // implementation report). Per P7-D2 Part D ("require provider
    // acceptance... then persist"), an unconfirmable timeout can never be
    // treated as acceptance — pendingPlanId is never persisted here.
    await this.attemptReconciliationRead(subscription);
    throw new ServiceUnavailableException(
      'Could not confirm the downgrade schedule with the billing provider; no local change was made — please retry',
    );
  }

  // ─── Cancellation — immediate (Step 8) + at period end (Step 9) ────────

  async cancel(
    tenantId: string,
    userId: string,
    dto: CancelSubscriptionDto,
    idempotencyKey: string,
  ): Promise<SubscriptionMutationView> {
    return this.withIdempotency(
      tenantId,
      userId,
      CANCEL_ENDPOINT_ID,
      idempotencyKey,
      async () => {
        const subscription =
          await this.subscriptionService.getSubscriptionForTenant(
            this.prisma,
            tenantId,
          );
        return dto.atPeriodEnd
          ? this.scheduleCancellationFlow(subscription)
          : this.immediateCancellationFlow(subscription);
      },
    );
  }

  private async immediateCancellationFlow(
    subscription: Subscription,
  ): Promise<Subscription> {
    if (subscription.status === 'CANCELLED') {
      return subscription; // idempotent
    }
    // P7-D2 Part B: ACTIVE is now a ratified source, alongside the P7-D1
    // sources PAST_DUE/PAUSED.
    if (
      subscription.status !== 'ACTIVE' &&
      subscription.status !== 'PAST_DUE' &&
      subscription.status !== 'PAUSED'
    ) {
      throw new ConflictException(
        `Subscription cannot be cancelled from ${subscription.status}`,
      );
    }
    this.assertHasProviderLink(subscription);

    try {
      await this.billingProvider.cancelSubscription(
        subscription.providerSubscriptionId,
        'immediate',
      );
    } catch (err) {
      if (err instanceof BillingProviderTimeoutError) {
        return this.reconcileCancelTimeout(subscription);
      }
      throw this.classifyProviderError(err);
    }

    const result = await this.subscriptionService.cancel(
      this.prisma,
      subscription,
      {},
    );
    return result.subscription;
  }

  private async scheduleCancellationFlow(
    subscription: Subscription,
  ): Promise<Subscription> {
    if (subscription.cancelAtPeriodEnd === true) {
      return subscription; // idempotent — already scheduled
    }
    if (subscription.status !== 'ACTIVE') {
      throw new ConflictException(
        `Subscription must be ACTIVE to schedule a cancellation (currently ${subscription.status})`,
      );
    }
    this.assertHasProviderLink(subscription);

    try {
      await this.billingProvider.cancelSubscription(
        subscription.providerSubscriptionId,
        'at_period_end',
      );
    } catch (err) {
      if (err instanceof BillingProviderTimeoutError) {
        return this.reconcileCancelTimeout(subscription);
      }
      throw this.classifyProviderError(err);
      // Provider rejection: cancelAtPeriodEnd is never persisted.
    }

    const result = await this.subscriptionService.scheduleCancellation(
      this.prisma,
      subscription,
    );
    return result.subscription;
  }

  private async reconcileCancelTimeout(
    subscription: Subscription,
  ): Promise<Subscription> {
    // Same disclosed limitation as downgrade scheduling: no
    // cancelled/pending-cancellation flag exists on
    // `BillingProviderSubscription` to positively confirm either
    // cancellation mode's acceptance. Reachability is confirmed; the
    // specific operation's outcome is not — never auto-apply.
    await this.attemptReconciliationRead(subscription);
    throw new ServiceUnavailableException(
      'Could not confirm the cancellation with the billing provider; no local change was made — please retry',
    );
  }

  // ─── Resume / reactivate (Step 10) ──────────────────────────────────────

  async resume(
    tenantId: string,
    userId: string,
    idempotencyKey: string,
  ): Promise<SubscriptionMutationView> {
    return this.withIdempotency(
      tenantId,
      userId,
      RESUME_ENDPOINT_ID,
      idempotencyKey,
      async () => {
        const subscription =
          await this.subscriptionService.getSubscriptionForTenant(
            this.prisma,
            tenantId,
          );
        if (subscription.status === 'ACTIVE') {
          return subscription; // idempotent — nothing to resume
        }
        // EXPIRED must remain terminal (no outgoing edge exists at all —
        // the state-machine allowlist would reject either downstream call
        // anyway, but this fails fast with a clearer message and no
        // wasted provider call).
        if (subscription.status === 'EXPIRED') {
          throw new ConflictException(
            'Subscription is EXPIRED and cannot be resumed',
          );
        }
        if (
          subscription.status === 'PENDING' ||
          subscription.status === 'TRIALING'
        ) {
          throw new ConflictException(
            `Subscription is ${subscription.status} — nothing to resume`,
          );
        }
        this.assertHasProviderLink(subscription);

        try {
          await this.billingProvider.resumeSubscription(
            subscription.providerSubscriptionId,
          );
        } catch (err) {
          if (err instanceof BillingProviderTimeoutError) {
            return this.reconcileResumeTimeout(subscription);
          }
          throw this.classifyProviderError(err);
        }

        return this.applyResumeTransition(subscription);
      },
    );
  }

  private async reconcileResumeTimeout(
    subscription: Subscription,
  ): Promise<Subscription> {
    // Unlike upgrade/downgrade/cancel, resume's success signal is weaker by
    // necessity: `getSubscription()` exposes no explicit status field, so
    // "the provider still recognizes this subscription at all" (no throw)
    // is the only confirmation available. This is a deliberately
    // conservative reading, not an invented vendor-specific guarantee —
    // both Stage 1 target methods (`recoverPayment`/`reactivate`) are
    // themselves idempotent, so calling one an extra time on a false
    // positive is harmless.
    await this.attemptReconciliationRead(subscription);
    return this.applyResumeTransition(subscription);
  }

  private async applyResumeTransition(
    subscription: Subscription,
  ): Promise<Subscription> {
    if (
      subscription.status === 'PAST_DUE' ||
      subscription.status === 'PAUSED'
    ) {
      const result = await this.subscriptionService.recoverPayment(
        this.prisma,
        subscription,
        {},
      );
      return result.subscription;
    }
    // Only CANCELLED remains reachable here (ACTIVE/EXPIRED/PENDING/TRIALING
    // are all handled — and returned from — earlier in `resume()`).
    const result = await this.subscriptionService.reactivate(
      this.prisma,
      subscription,
      {},
    );
    return result.subscription;
  }

  // ─── Callable reconciliation / period-rollover operation (Step 13) ─────
  //
  // No cron/scheduler is registered anywhere in Stage 2 (P7-D2 Part F) —
  // this method exists to be CALLED, later, by whatever scheduling
  // mechanism a separately-authorized future wave wires up. Safe to call
  // repeatedly: a subscription not past its confirmed period boundary is
  // always a no-op.

  async reconcilePeriod(tenantId: string): Promise<SubscriptionMutationView> {
    const subscription =
      await this.subscriptionService.getSubscriptionForTenant(
        this.prisma,
        tenantId,
      );
    if (
      subscription.status !== 'ACTIVE' ||
      !subscription.providerSubscriptionId
    ) {
      return this.toView(subscription);
    }

    const providerState = await this.attemptReconciliationRead(subscription);
    const boundaryReached =
      subscription.currentPeriodEnd !== null &&
      providerState.currentPeriodStart.getTime() >=
        subscription.currentPeriodEnd.getTime();
    if (!boundaryReached) {
      return this.toView(subscription);
    }

    let updated = subscription;
    if (updated.pendingPlanId) {
      const result = await this.subscriptionService.applyScheduledDowngrade(
        this.prisma,
        updated,
        {
          currentPeriodStart: providerState.currentPeriodStart,
          currentPeriodEnd: providerState.currentPeriodEnd,
        },
      );
      updated = result.subscription;
    }
    if (updated.status === 'ACTIVE' && updated.cancelAtPeriodEnd === true) {
      const result = await this.subscriptionService.cancel(
        this.prisma,
        updated,
        {},
      );
      updated = result.subscription;
    }
    // Disclosed, known gap: a plain renewal (boundary reached, nothing
    // scheduled) has no Stage 1 method to refresh currentPeriodStart/End
    // alone without a status/plan change alongside it — Stage 2 does not
    // invent one (would need either a new SubscriptionEvent enum value,
    // which the migration-safety guard rejects for a non-legacy migration
    // — see subscription.service.ts's own scheduleCancellation comment —
    // or reusing an existing type in a way that would misrepresent what
    // happened). Deferred to a future, separately-ratified stage.
    return this.toView(updated);
  }

  // ─── Shared helpers ─────────────────────────────────────────────────────

  /**
   * HTTP-level idempotency (Step 12) — distinct from, and layered on top
   * of, `SubscriptionService`'s own CAS/same-target-state idempotency, and
   * distinct again from the future `BillingWebhookEvent`'s webhook
   * deduplication (D7, not built here). Reuses the exact
   * `idempotency_keys` table/`IdempotencyService` `checkout.controller.ts`
   * already established — no schema change, no new table.
   *
   * A replayed/raced key never re-invokes `proceed` (never re-calls the
   * provider, never re-runs the state-machine method) — it simply re-reads
   * and returns the CURRENT subscription state. This is simpler than
   * `checkout`'s own `resultOrderId`-remembered-response design (which
   * exists because checkout creates a NEW row every call); a subscription
   * mutation mutates one already-existing, `tenantId`-unique row in place,
   * so "the current state" and "what a successful replay would have
   * returned" are the same value by construction — `SubscriptionService`'s
   * own idempotent-CAS contract is exactly what makes this safe.
   */
  private async withIdempotency(
    tenantId: string,
    userId: string,
    endpoint: string,
    idempotencyKey: string,
    proceed: () => Promise<Subscription>,
  ): Promise<SubscriptionMutationView> {
    const existing = await this.idempotencyService.findExisting(idempotencyKey);
    if (existing) {
      if (existing.tenantId !== tenantId) {
        // Never confirm/deny another tenant's key or leak their subscription.
        throw new ConflictException('Idempotency key already in use');
      }
      const current = await this.subscriptionService.getSubscriptionForTenant(
        this.prisma,
        tenantId,
      );
      return this.toView(current);
    }

    const claim = await this.prisma.$transaction((tx) =>
      this.idempotencyService.claim(tx, {
        key: idempotencyKey,
        userId,
        endpoint,
        tenantId,
      }),
    );
    if (!claim) {
      // Lost the race to a concurrent identical request — same safe replay.
      const current = await this.subscriptionService.getSubscriptionForTenant(
        this.prisma,
        tenantId,
      );
      return this.toView(current);
    }

    const updated = await proceed();
    return this.toView(updated);
  }

  /** Provider-error classification (Step 15/P7-D2 Part E) — a
   * `BillingProviderTimeoutError` is NEVER passed here; every call site
   * checks for it first and routes to its own reconciliation branch
   * instead. Anything reaching this method is either an explicit
   * rejection (safe, business-readable message) or a genuinely
   * unclassified failure (generic 503, no provider details ever
   * surfaced). */
  private classifyProviderError(err: unknown): HttpException {
    if (err instanceof BillingProviderRejectedError) {
      return new ConflictException(err.message);
    }
    return new ServiceUnavailableException(
      'Billing provider is currently unavailable; please retry shortly',
    );
  }

  private async attemptReconciliationRead(
    subscription: Subscription,
  ): Promise<BillingProviderSubscription> {
    if (!subscription.providerSubscriptionId) {
      throw new ServiceUnavailableException(
        'Billing provider reconciliation unavailable — no linked provider subscription',
      );
    }
    try {
      return await this.billingProvider.getSubscription(
        subscription.providerSubscriptionId,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Billing provider is currently unavailable; please retry shortly',
      );
    }
  }

  private assertHasProviderLink(
    subscription: Subscription,
  ): asserts subscription is Subscription & { providerSubscriptionId: string } {
    if (!subscription.providerSubscriptionId) {
      throw new ConflictException(
        'Subscription has no linked billing-provider record',
      );
    }
  }

  private async assertPlanExists(planId: string): Promise<void> {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
  }

  private async toView(
    subscription: Subscription,
  ): Promise<SubscriptionMutationView> {
    const plan: SubscriptionMutationPlanView =
      await this.prisma.plan.findUniqueOrThrow({
        where: { id: subscription.planId },
        select: { key: true, name: true },
      });
    return {
      status: subscription.status,
      plan,
      pendingPlanId: subscription.pendingPlanId,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
      graceEndsAt: subscription.graceEndsAt,
      trialEndsAt: subscription.trialEndsAt,
    };
  }
}
