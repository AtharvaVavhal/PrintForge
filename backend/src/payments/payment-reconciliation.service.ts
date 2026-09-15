import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { Order } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { PaymentAccountResolutionError } from './payment-accounts/payment-account-resolution.errors';
import { PaymentAccountResolutionService } from './payment-accounts/payment-account-resolution.service';
import { PaymentAccountsService } from './payment-accounts/payment-accounts.service';
import { RazorpayOrderPayment, RazorpayService } from './razorpay/razorpay.service';
import { PaymentsService } from './payments.service';

/**
 * Active Razorpay reconciliation (Phase 13.3 §1/§5).
 *
 * Closes the "money captured at Razorpay, order never marked PAID" gap:
 * for a PENDING_PAYMENT order whose frontend `verify` callback never
 * arrived AND whose webhook was lost/failed, this cron asks Razorpay
 * directly (`orders.fetchPayments`) whether a payment was captured, and:
 *
 *  - captured + amount/currency/order-id match EXACTLY  -> transition PAID
 *  - captured but ANY mismatch                          -> transition nothing,
 *                                                          Sentry error,
 *                                                          leave PENDING_PAYMENT
 *  - authorized-but-not-captured                        -> leave alone, alert
 *  - Razorpay reports no payment AND order is past the
 *    give-up threshold                                  -> transition
 *                                                          PAYMENT_FAILED
 *  - Razorpay API call itself fails                     -> leave alone, alert,
 *                                                          retry next run
 *
 * Bounded work: only PENDING_PAYMENT orders in a [RECONCILE_AFTER,
 * RECONCILE_MAX_AGE] age window with no CAPTURED attempt, at most
 * BATCH_SIZE per run — never "query Razorpay for every order".
 *
 * Concurrency: the actual state transition runs through
 * PaymentsService.reconcileCapturedPayment / failStalePendingOrder, which
 * SELECT ... FOR UPDATE-lock the order row and CAS the transition. Two
 * instances may both fetch the same Razorpay payment, but only one
 * transition succeeds; the other no-ops. The partial unique index on
 * `payment_attempts WHERE status='CAPTURED'` is the final backstop —
 * identical to the webhook path.
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  /** Give the normal flow (verify callback, webhook) time to land first. */
  private readonly RECONCILE_AFTER_MINUTES = 15;
  /** Don't keep polling Razorpay for ancient orders. */
  private readonly RECONCILE_MAX_AGE_DAYS = 7;
  /**
   * Only after this long with an AUTHORITATIVE "no captured/authorized
   * payment" answer from Razorpay do we mark a still-pending order
   * PAYMENT_FAILED. A Razorpay Checkout payment captures within the
   * checkout session (seconds–minutes); 3h of Razorpay itself reporting
   * zero payments means the customer never paid.
   */
  private readonly FAIL_STALE_AFTER_MINUTES = 180;
  private readonly BATCH_SIZE = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpayService: RazorpayService,
    private readonly paymentsService: PaymentsService,
    private readonly paymentAccountResolutionService: PaymentAccountResolutionService,
    private readonly paymentAccountsService: PaymentAccountsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcile(): Promise<void> {
    try {
      // Orders that never even reached Razorpay (no razorpayOrderId) can't
      // have a captured payment — fail the genuinely stale ones without an
      // API call.
      await this.failStaleOrdersWithoutRazorpayOrder();

      // P8-10: no blanket "global Razorpay not configured -> skip
      // everything" gate anymore — a merchant-bound order (`paymentAccountId`
      // set) reconciles via its OWN account's adapter/credentials
      // regardless of whether the global `RazorpayService` happens to be
      // configured (task item 9/12: never route commerce reconciliation
      // through the global service). Only an UNBOUND order's reconciliation
      // still depends on the global service being configured — checked
      // per-order, inside `fetchPayments` below.
      const candidates = await this.findReconcileCandidates();
      if (candidates.length === 0) {
        return;
      }
      this.logger.log(
        `Reconciliation: checking ${candidates.length} pending order(s) against Razorpay`,
      );
      for (const order of candidates) {
        await this.reconcileOne(order).catch((err: unknown) => {
          this.logger.error(
            `Reconciliation: unexpected error for order ${order.id}`,
            err instanceof Error ? err.stack : err,
          );
          Sentry.captureException(
            err instanceof Error ? err : new Error(String(err)),
            {
              level: 'error',
              tags: { area: 'reconciliation_unexpected' },
              extra: this.safeContext(order),
            },
          );
        });
      }
    } catch (err) {
      this.logger.error(
        'Payment reconciliation cron failed',
        err instanceof Error ? err.stack : err,
      );
      Sentry.captureException(
        err instanceof Error ? err : new Error(String(err)),
        { tags: { area: 'reconciliation_cron' } },
      );
    }
  }

  // ─── Selection (bounded) ───────────────────────────────────────────────

  private async findReconcileCandidates(): Promise<Order[]> {
    const now = Date.now();
    return this.prisma.order.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        razorpayOrderId: { not: null },
        createdAt: {
          lte: new Date(now - this.RECONCILE_AFTER_MINUTES * 60_000),
          gte: new Date(now - this.RECONCILE_MAX_AGE_DAYS * 86_400_000),
        },
        paymentAttempts: { none: { status: 'CAPTURED' } },
      },
      orderBy: { createdAt: 'asc' },
      take: this.BATCH_SIZE,
    });
  }

  // ─── Per-order reconciliation against Razorpay ─────────────────────────

  private async reconcileOne(order: Order): Promise<void> {
    const razorpayOrderId = order.razorpayOrderId;
    if (!razorpayOrderId) {
      return;
    }

    const payments = await this.fetchPayments(order, razorpayOrderId);
    if (payments === null) {
      return; // not configured / no credentials / provider or resolution failure — retry next run
    }

    const captured = payments.find(
      (p) => p.status === 'captured' || p.captured,
    );
    if (captured) {
      const result = await this.paymentsService.reconcileCapturedPayment(
        order,
        {
          id: captured.id,
          razorpayOrderId: captured.razorpayOrderId,
          amountPaise: captured.amountPaise,
          currency: captured.currency,
          method: captured.method,
        },
      );
      if (result === 'PAID') {
        this.logger.warn(
          `Reconciliation: order ${order.orderNumber} (${order.id}) recovered to PAID — payment ${captured.id} was captured but verify+webhook both missed it`,
        );
        Sentry.captureMessage('Order recovered to PAID by reconciliation', {
          level: 'warning',
          tags: { area: 'reconciliation_recovered' },
          extra: {
            ...this.safeContext(order),
            razorpayPaymentId: captured.id,
          },
        });
      }
      // 'MISMATCH' is already logged + Sentry-reported inside
      // reconcileCapturedPayment; 'ALREADY_TERMINAL' is a clean no-op.
      return;
    }

    const authorized = payments.find(
      (p) => p.status === 'authorized' && !p.captured,
    );
    if (authorized) {
      // Money authorized but not captured — ambiguous. Never mark PAID
      // (not captured) and never mark PAYMENT_FAILED (it may still
      // capture). Surface it for a human.
      this.logger.warn(
        `Reconciliation: order ${order.id} has an authorized-but-not-captured Razorpay payment ${authorized.id}`,
      );
      Sentry.captureMessage(
        'Reconciliation: authorized-but-not-captured payment',
        {
          level: 'warning',
          tags: { area: 'reconciliation_authorized_uncaptured' },
          extra: {
            ...this.safeContext(order),
            razorpayPaymentId: authorized.id,
          },
        },
      );
      return;
    }

    // Authoritative: Razorpay reports NO captured/authorized payment.
    await this.maybeFailStale(
      order,
      'Razorpay reports no payment for this order',
    );
  }

  /**
   * Phase 8 (P8-10, task items 9/12) — routes to the CORRECT credential
   * source for this specific order:
   *
   *  - `order.paymentAccountId` set (every order bound under P8-9+) ->
   *    resolve that SAME bound account (`resolveForBoundAccount` — never
   *    re-derived from `Store`) and call ITS OWN adapter's
   *    `fetchOrderPayments` with ITS OWN decrypted credentials. The global
   *    `RazorpayService` is never touched for these orders.
   *  - `order.paymentAccountId` null (a legacy/unbound order — none should
   *    exist going forward, but historical rows may) -> the pre-P8-10
   *    global-credential path, UNCHANGED, still gated by
   *    `razorpayService.isConfigured()`.
   *
   * Returns `null` to mean "skip this order this run" (not configured, no
   * credentials, or the provider/resolution call itself failed) — the
   * caller's existing retry-next-run semantics are unchanged either way.
   */
  private async fetchPayments(
    order: Order,
    razorpayOrderId: string,
  ): Promise<RazorpayOrderPayment[] | null> {
    if (order.paymentAccountId) {
      let resolved;
      try {
        resolved = await this.paymentAccountResolutionService.resolveForBoundAccount(
          order.tenantId,
          order.paymentAccountId,
        );
      } catch (err) {
        if (!(err instanceof PaymentAccountResolutionError)) {
          throw err;
        }
        this.logger.warn(
          `Reconciliation: bound PaymentAccount ${order.paymentAccountId} for order ${order.id} no longer resolves (${err.name}) — skipping this run`,
        );
        return null;
      }

      const encryptedCredentials = await this.paymentAccountsService.getEncryptedCredentials(
        order.tenantId,
        resolved.paymentAccountId,
      );
      if (!encryptedCredentials) {
        this.logger.warn(
          `Reconciliation: PaymentAccount ${resolved.paymentAccountId} has no credentials configured — skipping order ${order.id} this run`,
        );
        return null;
      }

      try {
        const merchantPayments = await resolved.adapter.fetchOrderPayments(
          encryptedCredentials,
          razorpayOrderId,
        );
        return merchantPayments.map((p) => ({
          id: p.providerPaymentId,
          razorpayOrderId: p.providerOrderId,
          amountPaise: p.amountPaise,
          currency: p.currency,
          status: p.status,
          captured: p.captured,
          method: p.method,
        }));
      } catch (err) {
        this.logger.warn(
          `Reconciliation: fetchOrderPayments failed for order ${order.id} (${razorpayOrderId}) via PaymentAccount ${resolved.paymentAccountId}`,
          err instanceof Error ? err.message : err,
        );
        Sentry.captureException(
          err instanceof Error ? err : new Error(String(err)),
          {
            level: 'warning',
            tags: { area: 'reconciliation_razorpay_fetch' },
            extra: this.safeContext(order),
          },
        );
        return null;
      }
    }

    // Legacy/unbound order — unchanged pre-P8-10 global-credential path.
    if (!this.razorpayService.isConfigured()) {
      this.logger.debug(
        `Reconciliation: Razorpay not configured — skipping API reconciliation for unbound order ${order.id}`,
      );
      return null;
    }
    try {
      return await this.razorpayService.fetchOrderPayments(razorpayOrderId);
    } catch (err) {
      this.logger.warn(
        `Reconciliation: fetchOrderPayments failed for order ${order.id} (${razorpayOrderId})`,
        err instanceof Error ? err.message : err,
      );
      Sentry.captureException(
        err instanceof Error ? err : new Error(String(err)),
        {
          level: 'warning',
          tags: { area: 'reconciliation_razorpay_fetch' },
          extra: this.safeContext(order),
        },
      );
      return null;
    }
  }

  // ─── Stale-order failover (state-machine legal, non-destructive) ───────

  private async failStaleOrdersWithoutRazorpayOrder(): Promise<void> {
    const cutoff = new Date(
      Date.now() - this.FAIL_STALE_AFTER_MINUTES * 60_000,
    );
    const orders = await this.prisma.order.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        razorpayOrderId: null,
        createdAt: { lte: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: this.BATCH_SIZE,
    });
    for (const order of orders) {
      await this.maybeFailStale(
        order,
        'no Razorpay order was ever created for this checkout',
      );
    }
  }

  private async maybeFailStale(order: Order, why: string): Promise<void> {
    const ageMinutes = (Date.now() - order.createdAt.getTime()) / 60_000;
    if (ageMinutes < this.FAIL_STALE_AFTER_MINUTES) {
      return; // not stale enough yet — reconciliation keeps its chance
    }
    const failed = await this.paymentsService.failStalePendingOrder(order);
    if (failed) {
      this.logger.warn(
        `Reconciliation: stale unpaid order ${order.orderNumber} (${order.id}) -> PAYMENT_FAILED after ${ageMinutes.toFixed(0)}m — ${why}`,
      );
    }
  }

  // ─── Observability helper (no secrets) ────────────────────────────────

  private safeContext(order: Order): Record<string, string | number> {
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      razorpayOrderId: order.razorpayOrderId ?? '',
      orderAgeMinutes: Math.round(
        (Date.now() - order.createdAt.getTime()) / 60_000,
      ),
    };
  }
}
