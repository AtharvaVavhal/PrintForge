import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { PaymentAttemptStatus, Prisma, RefundStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { resolveTenantAuditActor } from '../../common/audit/tenant-actor-attribution';
import { assertObjectInTenant } from '../../common/tenant/object-auth';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { TenantContext } from '../../common/tenant/tenant-context';
import type { RefundView } from '../../orders/dto/order-view.interface';
import {
  MerchantPaymentUnavailableError,
  PaymentProviderUnavailableError,
} from '../merchant-commerce.errors';
import { PaymentAccountResolutionError } from '../payment-accounts/payment-account-resolution.errors';
import { PaymentAccountResolutionService } from '../payment-accounts/payment-account-resolution.service';
import { PaymentAccountsService } from '../payment-accounts/payment-accounts.service';
import { PaymentProviderError } from '../providers/payment-provider.errors';
import { CreateRefundDto } from './dto/create-refund.dto';

/** Refund statuses that RESERVE part of the captured amount — a `FAILED`
 * refund never moved money, so it does not count against the cumulative
 * refundable balance (task item 4/6: cumulative limit + concurrency
 * safety). `PENDING` counts too, not just `PROCESSED` — this is what
 * makes two concurrent requests unable to both reserve the same paise
 * twice (see `createRefund`'s own comment). */
const RESERVING_STATUSES: RefundStatus[] = [
  RefundStatus.PENDING,
  RefundStatus.PROCESSED,
];

/**
 * Phase 8 (P8-11) — the merchant commerce refund business workflow.
 * Objective flow (task): Order/PaymentAttempt -> historically bound
 * PaymentAccount -> `resolveForBoundAccount()` -> `PaymentProviderAdapter`
 * -> Razorpay merchant account -> Refund record -> webhook/reconciliation
 * completion where applicable.
 *
 * Deliberately a NEW, separate, single-purpose service (mirrors
 * `PaymentAccountsService`/`PaymentAccountConnectionService`/
 * `PaymentAccountResolutionService`'s own each-concern-its-own-class
 * shape under `payments/`) rather than folding refund logic into
 * `OrdersService` (which has no Razorpay/PaymentAccount wiring and whose
 * existing `performCancellation`/`performRefundRecording` "record only,
 * refund processed manually in the Razorpay dashboard" behavior — §12.5/
 * §13.L, deliberately reverted once already in Phase 7 — is UNCHANGED by
 * this stage; this class adds a genuinely NEW, explicit, admin-initiated
 * in-app refund action, not a side effect of order cancellation) or into
 * `PaymentsService` (customer-facing, `userId`-owned; this is a tenant-
 * admin-owned, `TenantContext`-scoped operation, matching
 * `PaymentAccountsService`'s own authorization shape instead).
 *
 * Historical-account discipline (task's own "IMPORTANT", items 2/8/10):
 * every refund resolves the `PaymentAccount` via the PaymentAttempt's OWN
 * already-persisted `paymentAccountId` — `resolveForBoundAccount()` only,
 * NEVER `resolveForStore()` — so a refund always uses the account that
 * actually processed the original payment, even if that account has
 * since been disabled or the store's current active account has changed
 * (`resolveForBoundAccount` deliberately does not require `ACTIVE`
 * status, same P8-3 §6 point 2 / P8-9/P8-10 precedent). There is no
 * fallback to the global `RazorpayService`, no fallback to any other
 * account — an unresolvable historical account fails the refund cleanly.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly paymentAccountResolutionService: PaymentAccountResolutionService,
    private readonly paymentAccountsService: PaymentAccountsService,
  ) {}

  async createRefund(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    paymentAttemptId: string,
    dto: CreateRefundDto,
  ): Promise<RefundView> {
    const tenantId = tenantContext.tenantId;

    // ─── Phase 1: validate + reserve, inside one locked transaction ────
    //
    // `SELECT ... FOR UPDATE` locks the PaymentAttempt row (same
    // discipline `reconcileCapturedPayment`/`failStalePendingOrder` already
    // establish for this identical class of concern) so two concurrent
    // refund requests for the SAME attempt serialize: the second one's
    // lock acquisition blocks until the first transaction commits, then
    // its cumulative-balance re-read sees the first request's newly
    // -reserved amount — this is what makes "concurrent identical refund
    // requests" (task item 6/12) unable to both succeed when only one
    // full refund's worth of balance exists, without any new idempotency
    // infrastructure.
    const { refund, attempt } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM payment_attempts WHERE id = ${paymentAttemptId} FOR UPDATE
      `;
      const attempt = await tx.paymentAttempt.findUnique({
        where: { id: paymentAttemptId },
      });
      // 404, never 403 — same existence-leak-avoidance discipline every
      // other tenant-scoped lookup in this codebase already establishes.
      assertObjectInTenant(attempt, tenantId);

      if (attempt.status !== PaymentAttemptStatus.CAPTURED) {
        throw new ConflictException(
          `Payment attempt is not in a refundable state (${attempt.status})`,
        );
      }
      if (!attempt.razorpayPaymentId) {
        throw new ConflictException(
          'Payment attempt has no provider payment id to refund',
        );
      }
      if (!attempt.paymentAccountId) {
        // No historical PaymentAccount was ever bound to this payment
        // (pre-P8-9 legacy data) — there is no merchant credential to
        // refund through, and never a fallback to any other account.
        throw new MerchantPaymentUnavailableError();
      }

      const amountPaise = this.resolveRequestedAmount(
        dto.amountPaise,
        attempt.amountPaise,
      );
      if (amountPaise <= 0n) {
        throw new BadRequestException('Refund amount must be positive');
      }

      const existingRefunds = await tx.refund.findMany({
        where: {
          paymentAttemptId,
          status: { in: RESERVING_STATUSES },
        },
        select: { amountPaise: true },
      });
      const alreadyReserved = existingRefunds.reduce(
        (sum, r) => sum + r.amountPaise,
        0n,
      );
      const remaining = attempt.amountPaise - alreadyReserved;
      if (amountPaise > remaining) {
        throw new ConflictException(
          `Refund amount exceeds refundable balance (${remaining.toString()} paise remaining)`,
        );
      }

      const created = await tx.refund.create({
        data: {
          paymentAttemptId,
          amountPaise,
          status: RefundStatus.PENDING,
          reason: dto.reason,
          // Derived from the payment attempt this refund belongs to —
          // never a client-supplied value (same Phase 4 W7 / P4-D2
          // discipline every other tenantId column in this codebase
          // follows).
          tenantId: attempt.tenantId,
          // The HISTORICAL account, read off the attempt itself — never
          // re-resolved from the store's current configuration.
          paymentAccountId: attempt.paymentAccountId,
        },
      });

      await this.writeAudit(tx, tenantContext, actor, {
        action: 'refund.requested',
        targetId: created.id,
        metadata: {
          paymentAttemptId,
          amountPaise: amountPaise.toString(),
        },
      });

      return { refund: created, attempt };
    });

    // ─── Phase 2: the actual provider call, OUTSIDE any transaction ────
    //
    // Same "every external call sits outside any Postgres transaction"
    // discipline §13's preamble already establishes for `initiatePayment`
    // — a slow/hanging Razorpay call must never hold a Postgres
    // transaction (and therefore a row lock) open. `attempt.paymentAccountId`
    // — the HISTORICAL account, already validated non-null in Phase 1 and
    // the exact value just stamped onto the Refund row — is passed
    // through directly; never re-derived from the store, never re-picked.
    return this.callProviderAndSettle(
      tenantId,
      refund,
      attempt.razorpayPaymentId!,
      attempt.paymentAccountId!,
    );
  }

  /** `amountPaise` omitted -> full refund of the remaining captured
   * amount (task item 4: "support... partial refund, full refund" — full
   * is simply the degenerate case of "no amount given"). A malformed
   * numeric string (should already be rejected by the DTO's
   * `@IsNumberString`, but never trusted twice) throws the same
   * `BadRequestException` a genuinely-invalid amount would. */
  private resolveRequestedAmount(
    amountPaiseInput: string | undefined,
    capturedAmountPaise: bigint,
  ): bigint {
    if (amountPaiseInput === undefined) {
      return capturedAmountPaise;
    }
    try {
      return BigInt(amountPaiseInput);
    } catch {
      throw new BadRequestException('amountPaise must be a valid integer');
    }
  }

  private async callProviderAndSettle(
    tenantId: string,
    refund: { id: string; amountPaise: bigint; reason: string | null },
    // `PaymentAttempt.razorpayPaymentId` is `@unique` (schema.prisma) —
    // this value unambiguously identifies exactly one captured payment at
    // the provider, for exactly one local `PaymentAttempt`/`Order` (P8-13
    // explicit verification of the uniqueness assumption this method
    // relies on).
    providerPaymentId: string,
    paymentAccountId: string,
  ): Promise<RefundView> {
    let resolved;
    try {
      resolved =
        await this.paymentAccountResolutionService.resolveForBoundAccount(
          tenantId,
          paymentAccountId,
        );
    } catch (err) {
      await this.markFailed(refund.id, 'Merchant payment account unavailable');
      if (err instanceof PaymentAccountResolutionError) {
        throw new MerchantPaymentUnavailableError();
      }
      throw err;
    }

    const encryptedCredentials =
      await this.paymentAccountsService.getEncryptedCredentials(
        tenantId,
        resolved.paymentAccountId,
      );
    if (!encryptedCredentials) {
      await this.markFailed(
        refund.id,
        'Merchant payment account has no credentials configured',
      );
      throw new MerchantPaymentUnavailableError();
    }

    let result;
    try {
      result = await resolved.adapter.createRefund(encryptedCredentials, {
        providerPaymentId,
        amountPaise: refund.amountPaise,
        reason: refund.reason ?? undefined,
      });
    } catch (err) {
      await this.markFailed(refund.id, 'Provider refund call failed');
      if (err instanceof PaymentProviderError) {
        throw new PaymentProviderUnavailableError();
      }
      throw err;
    }

    // Razorpay's own `status` on the create response can already be
    // 'processed' (synchronous/instant refund, the common sandbox/UPI
    // case) or 'pending' (async, card refunds — settles later via the
    // `refund.processed`/`refund.failed` webhook, P8-10's pipeline
    // extended minimally for this by P8-11 — see
    // `PaymentsService.applyMerchantWebhookEvent`). A synchronously
    // -reported 'failed' is treated exactly like a thrown provider error.
    if (result.status === 'failed') {
      const failed = await this.markFailed(
        refund.id,
        'Provider reported the refund as failed',
        result.providerRefundId,
      );
      return this.toView(failed);
    }

    // 'processed' -> settle now; 'pending' -> stamp the provider id but
    // leave PENDING (this Refund row's own PENDING status now also means
    // "created at the provider, awaiting async completion" — no new
    // state is invented; the webhook handler CAS-transitions it onward
    // when Razorpay confirms — see `PaymentsService.applyRefundWebhookEvent`
    // and, for the race that can arise from the gap between THIS write and
    // that webhook's own delivery, `UnresolvedRefundWebhookError`'s doc
    // comment, P8-13 P1 #2).
    //
    // P8-13 (P8-D... audit §10/§18 P2 fix) — CAS-guarded exactly like
    // `markFailed` below, scoped to `status: PENDING`: never blindly
    // overwrite a row a racing webhook (or, after the P1 #2 fix, a
    // retried webhook delivery) already settled. `count === 0` here is
    // structurally not expected to occur before THIS write (nothing else
    // can find this row by `razorpayRefundId` before this exact statement
    // first stamps it — see the P1 #2 fix's own reasoning), but is never
    // silently assumed; a mismatch is logged loudly rather than trusted.
    const data =
      result.status === 'processed'
        ? {
            status: RefundStatus.PROCESSED,
            razorpayRefundId: result.providerRefundId,
          }
        : { razorpayRefundId: result.providerRefundId };
    const cas = await this.prisma.refund.updateMany({
      where: { id: refund.id, status: RefundStatus.PENDING },
      data,
    });
    if (cas.count !== 1) {
      this.logger.warn(
        `Refund ${refund.id}: settle-on-success CAS matched 0 rows (status was already changed by something else) — re-reading current state rather than overwriting it`,
      );
    }
    const settled = await this.prisma.refund.findUniqueOrThrow({
      where: { id: refund.id },
    });
    return this.toView(settled);
  }

  private async markFailed(
    refundId: string,
    failureReason: string,
    razorpayRefundId?: string,
  ): Promise<{
    id: string;
    amountPaise: bigint;
    status: RefundStatus;
    reason: string | null;
    createdAt: Date;
  }> {
    this.logger.warn(`Refund ${refundId} failed: ${failureReason}`);
    // P8-13 — Sentry capture, matching the exact convention every
    // comparable payment-side failure path already uses
    // (`PaymentsService.applyCaptured`'s mismatch/non-pending-order
    // alerts, `reconcileCapturedPayment`'s mismatch alert): a failed
    // refund is a real merchant-facing/financial event a human should be
    // able to find, not just a server log line.
    Sentry.captureMessage('Merchant refund failed', {
      level: 'warning',
      tags: { area: 'refund_failed' },
      extra: { refundId, failureReason },
    });
    // CAS-guarded — never overwrites an already-PROCESSED row (e.g. a
    // webhook that raced ahead and already settled it as PROCESSED before
    // this call's own outcome is known).
    await this.prisma.refund.updateMany({
      where: { id: refundId, status: RefundStatus.PENDING },
      data: {
        status: RefundStatus.FAILED,
        failureReason,
        ...(razorpayRefundId ? { razorpayRefundId } : {}),
      },
    });
    return this.prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    action: {
      action: string;
      targetId: string;
      metadata: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    const attribution = await resolveTenantAuditActor(tx, tenantContext, actor);
    await this.auditService.logTenantAction(tx, {
      tenantId: tenantContext.tenantId,
      ...attribution,
      action: action.action,
      targetType: 'Refund',
      targetId: action.targetId,
      metadata: action.metadata,
    });
  }

  private toView(refund: {
    id: string;
    amountPaise: bigint;
    status: RefundStatus;
    reason: string | null;
    createdAt: Date;
  }): RefundView {
    return {
      id: refund.id,
      amountPaise: refund.amountPaise.toString(),
      status: refund.status,
      reason: refund.reason,
      createdAt: refund.createdAt,
    };
  }
}
