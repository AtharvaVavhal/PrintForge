import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/node';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Order,
  OrderStatus,
  PaymentAttempt,
  PaymentAttemptStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { decimalToPaise } from '../cart/pricing/money.util';
import { isTransitionAllowed } from '../orders/state-machine/order-state-machine';
import { RazorpayService } from './razorpay/razorpay.service';
import { PaymentMismatchError } from './payment-mismatch.error';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import {
  InitiatePaymentView,
  VerifyPaymentView,
} from './dto/payment-views.interface';

/** Minimal shape of the Razorpay payment entity fields this module reads. */
interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number | string;
  currency?: string;
  status: string;
  method?: string;
  error_code?: string;
  error_description?: string;
}

const DEFAULT_CURRENCY = 'INR';

/** Outcome of a reconciliation-driven capture attempt (Phase 13.3). */
export type ReconcileCaptureResult = 'PAID' | 'ALREADY_TERMINAL' | 'MISMATCH';

export interface RazorpayWebhookPayload {
  event: string;
  payload?: { payment?: { entity: RazorpayPaymentEntity } };
  created_at?: number;
}

const CAPTURED_EVENT = 'payment.captured';
const FAILED_EVENT = 'payment.failed';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpayService: RazorpayService,
  ) {}

  // ─── POST /checkout/orders/:id/retry-payment ──────────────────────────
  //
  // Same flow for the very first payment attempt on a fresh PENDING_PAYMENT
  // order and for a genuine retry after PAYMENT_FAILED (§12.4's diagram has
  // no separate "first initiation" endpoint — "reuses razorpayOrderId if
  // set" naturally covers both: nothing to reuse on the first call, an
  // existing id to reuse on a retry).

  async initiatePayment(
    userId: string,
    orderId: string,
  ): Promise<InitiatePaymentView> {
    let order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) {
      // Ownership: never confirm/deny another user's order exists.
      throw new NotFoundException('Order not found');
    }

    if (order.status === OrderStatus.PAYMENT_FAILED) {
      const transitioned = await this.transitionOrder(
        this.prisma,
        order,
        OrderStatus.PENDING_PAYMENT,
        userId,
        'Customer retrying payment',
      );
      order =
        transitioned ??
        (await this.prisma.order.findUniqueOrThrow({
          where: { id: order.id },
        }));
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new ConflictException(
        `Order is not payable in its current status (${order.status})`,
      );
    }

    // Every external call sits outside any Postgres transaction (§13
    // preamble) — the Razorpay order create below, then a single-row CAS
    // update, mirrors §12.4's TXN2/D split exactly.
    let razorpayOrderId = order.razorpayOrderId;
    if (!razorpayOrderId) {
      const amountPaise = decimalToPaise(order.total);
      const rpOrder = await this.razorpayService.createOrder({
        amountPaise,
        currency: order.currency,
        receipt: order.orderNumber,
      });
      const assoc = await this.prisma.order.updateMany({
        where: { id: order.id, razorpayOrderId: null },
        data: { razorpayOrderId: rpOrder.id },
      });
      if (assoc.count === 1) {
        razorpayOrderId = rpOrder.id;
      } else {
        // Lost a concurrent double-association race (§13.H) — the other
        // caller's Razorpay order won; ours is a harmless orphan.
        const fresh = await this.prisma.order.findUniqueOrThrow({
          where: { id: order.id },
        });
        razorpayOrderId = fresh.razorpayOrderId!;
      }
    }

    const amountPaise = decimalToPaise(order.total);
    const attempt = await this.prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        razorpayOrderId,
        amountPaise,
        currency: order.currency,
        status: PaymentAttemptStatus.INITIATED,
      },
    });

    return {
      paymentAttemptId: attempt.id,
      razorpayOrderId,
      razorpayKeyId: this.razorpayService.getKeyId(),
      amountPaise: amountPaise.toString(),
      currency: order.currency,
    };
  }

  // ─── POST /payments/verify ─────────────────────────────────────────────
  //
  // Synchronous, single transaction (§13.I) — unlike the webhook, this is a
  // foreground call the frontend awaits a definitive answer from.

  async verifyPayment(
    userId: string,
    dto: VerifyPaymentDto,
  ): Promise<VerifyPaymentView> {
    const signatureValid = this.razorpayService.verifySignature({
      razorpayOrderId: dto.razorpay_order_id,
      razorpayPaymentId: dto.razorpay_payment_id,
      razorpaySignature: dto.razorpay_signature,
    });
    if (!signatureValid) {
      throw new BadRequestException('Invalid payment signature');
    }

    const order = await this.prisma.order.findUnique({
      where: { razorpayOrderId: dto.razorpay_order_id },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found for this payment');
    }

    // Fast path, no transaction: this exact payment was already captured
    // by an earlier call (this endpoint replayed, or a webhook that won
    // the race) — same success shape (§20), and critically avoids ever
    // picking a *different*, unrelated INITIATED attempt on this order
    // (there can legitimately be several — one per opened checkout
    // widget) the way a plain "most recent INITIATED" lookup would on
    // replay, which is what caused this to 500 before the fix: attempting
    // to stamp an already-used razorpayPaymentId onto a different row hit
    // that column's own unique constraint mid-transaction, and Postgres
    // aborts the whole transaction on any query error — a caught
    // exception doesn't let you keep issuing queries against it.
    const existingByPaymentId = await this.prisma.paymentAttempt.findUnique({
      where: { razorpayPaymentId: dto.razorpay_payment_id },
    });
    if (existingByPaymentId?.status === PaymentAttemptStatus.CAPTURED) {
      const current = await this.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      return { orderId: current.id, status: current.status };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const attempt =
          existingByPaymentId ??
          (await tx.paymentAttempt.findFirst({
            where: {
              orderId: order.id,
              razorpayOrderId: dto.razorpay_order_id,
              status: PaymentAttemptStatus.INITIATED,
            },
            orderBy: { createdAt: 'desc' },
          }));
        if (!attempt) {
          throw new ConflictException(
            'No pending payment attempt found for this order',
          );
        }

        const result = await tx.paymentAttempt.updateMany({
          where: {
            id: attempt.id,
            status: { not: PaymentAttemptStatus.CAPTURED },
          },
          data: {
            status: PaymentAttemptStatus.CAPTURED,
            razorpayPaymentId: dto.razorpay_payment_id,
            capturedAt: new Date(),
          },
        });

        if (result.count === 1) {
          await this.transitionOrder(
            tx,
            order,
            OrderStatus.PAID,
            userId,
            'Payment verified (client callback)',
          );
          await this.insertOutboxEvent(tx, 'ORDER_PAID', order);
        }

        const finalOrder = await tx.order.findUniqueOrThrow({
          where: { id: order.id },
        });
        return { orderId: finalOrder.id, status: finalOrder.status };
      });
    } catch (err) {
      if (!this.isUniqueConstraintViolation(err)) {
        throw err;
      }
      // Partial unique index (orderId) WHERE status='CAPTURED' — a
      // concurrent webhook (or another verify call) won for this order.
      // The transaction above rolled back cleanly on this error (Prisma's
      // guarantee), so it's safe to re-query fresh here — same success
      // shape, not our error to surface.
      this.logger.log(
        `verifyPayment: order ${order.id} already has a captured attempt (race) — no-op`,
      );
      const current = await this.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      return { orderId: current.id, status: current.status };
    }
  }

  // ─── POST /payments/webhook — Phase 1 (controller calls this) ─────────
  //
  // §12.3: verify signature, INSERT webhook_events ON CONFLICT DO NOTHING,
  // done. Actual processing is Phase 2, run only by WebhookProcessor's
  // poller — never inline here, regardless of outcome.

  async receiveWebhook(
    rawBody: string,
    signature: string,
    headerEventId: string | undefined,
  ): Promise<void> {
    if (!this.razorpayService.verifyWebhookSignature(rawBody, signature)) {
      // §12.3: invalid signature → no DB write at all.
      throw new BadRequestException('Invalid webhook signature');
    }

    let payload: RazorpayWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
    } catch {
      throw new BadRequestException('Malformed webhook payload');
    }

    const razorpayEventId = this.extractWebhookEventId(headerEventId, payload);
    // Timestamps use `now() AT TIME ZONE 'UTC'` — the bare `timestamp`
    // columns store a UTC wall clock exactly as every Prisma
    // `@default(now())` write does, so the retry poller's
    // `availableAt <= new Date()` comparison lines up regardless of the DB
    // session timezone. (A plain SQL `now()` here would store local wall
    // clock and skew that comparison.)
    await this.prisma.$queryRaw`
      INSERT INTO webhook_events (id, "razorpayEventId", payload, status, attempts, "availableAt", "createdAt", "updatedAt")
      VALUES (
        ${randomUUID()},
        ${razorpayEventId},
        ${JSON.stringify(payload)}::jsonb,
        'RECEIVED',
        0,
        (now() AT TIME ZONE 'UTC'),
        (now() AT TIME ZONE 'UTC'),
        (now() AT TIME ZONE 'UTC')
      )
      ON CONFLICT ("razorpayEventId") DO NOTHING
    `;
  }

  /**
   * The event-id field/header Razorpay uses for webhook dedup isn't
   * pinned down by anything in this repo (blueprint or SDK types) — I went
   * with the `X-Razorpay-Event-Id` header per Razorpay's own webhook docs
   * as the primary source, with a deterministic fallback derived from
   * stable payload fields so a retry of the same event still dedupes
   * correctly even if that header assumption is off. Flagged in the
   * completion report — worth confirming against a real delivery's headers
   * once the webhook is live.
   */
  private extractWebhookEventId(
    headerId: string | undefined,
    payload: RazorpayWebhookPayload,
  ): string {
    if (headerId && headerId.trim().length > 0) {
      return headerId.trim();
    }
    const paymentId = payload.payload?.payment?.entity?.id ?? 'unknown';
    return `${payload.event}:${paymentId}:${payload.created_at ?? ''}`;
  }

  // ─── Webhook Phase 2 — called by WebhookProcessor's poller ─────────────

  /** Returns whether this event was acted on or ignored (WebhookEventStatus). */
  async applyWebhookEvent(
    tx: Prisma.TransactionClient,
    payload: RazorpayWebhookPayload,
  ): Promise<'PROCESSED' | 'IGNORED'> {
    const paymentEntity = payload.payload?.payment?.entity;
    if (
      !paymentEntity ||
      (payload.event !== CAPTURED_EVENT && payload.event !== FAILED_EVENT)
    ) {
      return 'IGNORED';
    }

    const order = await tx.order.findUnique({
      where: { razorpayOrderId: paymentEntity.order_id },
    });
    if (!order) {
      this.logger.warn(
        `Webhook ${payload.event} for unknown razorpayOrderId=${paymentEntity.order_id}`,
      );
      return 'IGNORED';
    }

    const attempt = await this.findOrCreateAttempt(tx, order, paymentEntity);

    if (payload.event === CAPTURED_EVENT) {
      await this.applyCaptured(tx, order, attempt, paymentEntity);
    } else {
      await this.applyFailed(tx, order, attempt, paymentEntity);
    }
    return 'PROCESSED';
  }

  /** §12.1: "upserting the row first if the webhook arrived before any local row existed — handled, not assumed away." */
  private async findOrCreateAttempt(
    tx: Prisma.TransactionClient,
    order: Order,
    paymentEntity: RazorpayPaymentEntity,
  ): Promise<PaymentAttempt> {
    const byPaymentId = await tx.paymentAttempt.findUnique({
      where: { razorpayPaymentId: paymentEntity.id },
    });
    if (byPaymentId) {
      return byPaymentId;
    }

    const byOrder = await tx.paymentAttempt.findFirst({
      where: {
        orderId: order.id,
        razorpayOrderId: paymentEntity.order_id,
        status: PaymentAttemptStatus.INITIATED,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (byOrder) {
      return tx.paymentAttempt.update({
        where: { id: byOrder.id },
        data: { razorpayPaymentId: paymentEntity.id },
      });
    }

    return tx.paymentAttempt.create({
      data: {
        orderId: order.id,
        razorpayOrderId: paymentEntity.order_id,
        razorpayPaymentId: paymentEntity.id,
        amountPaise: BigInt(paymentEntity.amount),
        status: PaymentAttemptStatus.INITIATED,
      },
    });
  }

  private async applyCaptured(
    tx: Prisma.TransactionClient,
    order: Order,
    attempt: PaymentAttempt,
    paymentEntity: RazorpayPaymentEntity,
  ): Promise<void> {
    // §12.1 / Phase 13.3 §4 — a captured payment whose amount, currency,
    // or Razorpay order id does not EXACTLY match this order is never
    // accepted: this throws PaymentMismatchError, which rolls back the
    // whole transaction (nothing partial) and is dead-lettered +
    // Sentry-reported by WebhookProcessor.processOne. The order stays
    // PENDING_PAYMENT for investigation.
    this.assertCapturedPaymentMatchesOrder(order, {
      razorpayOrderId: paymentEntity.order_id,
      amountPaise: BigInt(paymentEntity.amount),
      currency: paymentEntity.currency ?? DEFAULT_CURRENCY,
    });

    // Deliberately no try/catch here: a P2002 on the partial unique index
    // (a concurrent verify/webhook already captured a different attempt
    // for this order) must abort this whole transaction, not be caught
    // and continued past — Postgres keeps a transaction aborted after any
    // failed statement within it, so any further query on this same `tx`
    // would itself fail with "current transaction is aborted" regardless
    // of the JS-level catch. WebhookProcessor.processOne catches this
    // specific error *outside* the transaction and treats it as the
    // no-op it is (see isUniqueConstraintViolation, made public for it).
    const result = await tx.paymentAttempt.updateMany({
      where: {
        id: attempt.id,
        status: { not: PaymentAttemptStatus.CAPTURED },
      },
      data: {
        status: PaymentAttemptStatus.CAPTURED,
        razorpayPaymentId: paymentEntity.id,
        method: paymentEntity.method,
        capturedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      return; // duplicate delivery of an event we already applied — no-op
    }

    if (!isTransitionAllowed(order.status, OrderStatus.PAID)) {
      // The attempt is now correctly recorded CAPTURED (money WAS taken),
      // but the order is no longer PENDING_PAYMENT — e.g. reconciliation
      // already gave up on it as stale. Do NOT force an illegal
      // transition; surface it loudly for a human instead.
      this.logger.error(
        `Captured payment for order ${order.id} which is in ${order.status}, not PENDING_PAYMENT — attempt recorded CAPTURED, order left as-is`,
      );
      Sentry.captureMessage('Captured payment on a non-pending order', {
        level: 'error',
        tags: { area: 'payments_capture_state' },
        extra: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderStatus: order.status,
          razorpayOrderId: order.razorpayOrderId ?? '',
          razorpayPaymentId: paymentEntity.id,
        },
      });
      return;
    }

    const transitioned = await this.transitionOrder(
      tx,
      order,
      OrderStatus.PAID,
      null,
      'Payment captured (webhook)',
    );
    if (transitioned) {
      await this.insertOutboxEvent(tx, 'ORDER_PAID', order);
    }
  }

  /**
   * Exact, non-floating comparison of a Razorpay-reported capture against
   * what this order should have been charged (Phase 13.3 §4). Currency is
   * compared as an exact string; amount as bigint paise via the same
   * decimalToPaise the checkout total was built with. Throws
   * PaymentMismatchError on ANY discrepancy so no caller can mark a
   * mismatched payment PAID.
   */
  assertCapturedPaymentMatchesOrder(
    order: Pick<Order, 'razorpayOrderId' | 'currency' | 'total'>,
    captured: {
      razorpayOrderId: string;
      amountPaise: bigint;
      currency: string;
    },
  ): void {
    if (
      order.razorpayOrderId &&
      captured.razorpayOrderId !== order.razorpayOrderId
    ) {
      throw new PaymentMismatchError(
        'RAZORPAY_ORDER_ID_MISMATCH',
        `expected ${order.razorpayOrderId}, got ${captured.razorpayOrderId}`,
      );
    }
    const expectedCurrency = order.currency || DEFAULT_CURRENCY;
    if (captured.currency !== expectedCurrency) {
      throw new PaymentMismatchError(
        'CURRENCY_MISMATCH',
        `expected ${expectedCurrency}, got ${captured.currency}`,
      );
    }
    const expectedPaise = decimalToPaise(order.total);
    if (captured.amountPaise !== expectedPaise) {
      throw new PaymentMismatchError(
        'AMOUNT_MISMATCH',
        `expected ${expectedPaise} paise, got ${captured.amountPaise} paise`,
      );
    }
  }

  private async applyFailed(
    tx: Prisma.TransactionClient,
    order: Order,
    attempt: PaymentAttempt,
    paymentEntity: RazorpayPaymentEntity,
  ): Promise<void> {
    const result = await tx.paymentAttempt.updateMany({
      where: {
        id: attempt.id,
        status: {
          notIn: [PaymentAttemptStatus.CAPTURED, PaymentAttemptStatus.FAILED],
        },
      },
      data: {
        status: PaymentAttemptStatus.FAILED,
        razorpayPaymentId: paymentEntity.id,
        failureCode: paymentEntity.error_code ?? null,
        failureReason: paymentEntity.error_description ?? null,
        method: paymentEntity.method,
      },
    });
    if (result.count !== 1) {
      return; // already terminal (captured or failed) — duplicate delivery, no-op
    }

    const transitioned = await this.transitionOrder(
      tx,
      order,
      OrderStatus.PAYMENT_FAILED,
      null,
      'Payment failed (webhook)',
    );
    if (transitioned) {
      await this.insertOutboxEvent(
        tx,
        'ORDER_STATUS_CHANGED',
        order,
        OrderStatus.PAYMENT_FAILED,
      );
    }
  }

  // ─── Reconciliation (Phase 13.3 — called only by PaymentReconciliationService) ──

  /**
   * Apply a captured Razorpay payment discovered by reconciliation (the
   * frontend `verify` callback never arrived AND no webhook was
   * processed). Same guarantees as the webhook capture path:
   *
   *  - amount / currency / razorpay-order-id verified EXACTLY first
   *    (assertCapturedPaymentMatchesOrder) — a mismatch returns 'MISMATCH'
   *    and transitions nothing;
   *  - the order row is SELECT ... FOR UPDATE-locked, so two instances
   *    that both fetched the same Razorpay payment serialize here and only
   *    one performs the transition (the other sees a non-pending status
   *    and no-ops);
   *  - the CAS on paymentAttempt + the partial unique index
   *    (`payment_attempts WHERE status='CAPTURED'`) are the ultimate
   *    single-writer backstop, identical to the webhook path;
   *  - the same OrderStatusHistory row + ORDER_PAID outbox event are
   *    written, once, on the branch that actually transitioned.
   *
   * The Razorpay API call itself happens in the caller, outside any
   * transaction (§13 preamble) — this method only takes the already-
   * fetched, normalized payment.
   */
  async reconcileCapturedPayment(
    order: Order,
    captured: {
      id: string;
      razorpayOrderId: string;
      amountPaise: bigint;
      currency: string;
      method?: string;
    },
  ): Promise<ReconcileCaptureResult> {
    try {
      this.assertCapturedPaymentMatchesOrder(order, {
        razorpayOrderId: captured.razorpayOrderId,
        amountPaise: captured.amountPaise,
        currency: captured.currency,
      });
    } catch (err) {
      if (err instanceof PaymentMismatchError) {
        this.logger.error(
          `Reconciliation mismatch for order ${order.id}: ${err.message} — NOT marking PAID`,
        );
        Sentry.captureException(err, {
          level: 'error',
          tags: { area: 'reconciliation_mismatch', reason: err.reason },
          extra: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderStatus: order.status,
            razorpayOrderId: order.razorpayOrderId ?? '',
            razorpayPaymentId: captured.id,
          },
        });
        return 'MISMATCH';
      }
      throw err;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ status: OrderStatus }[]>`
          SELECT status FROM orders WHERE id = ${order.id} FOR UPDATE
        `;
        const current = locked[0];
        if (!current || current.status !== OrderStatus.PENDING_PAYMENT) {
          return 'ALREADY_TERMINAL';
        }
        const alreadyCaptured = await tx.paymentAttempt.findFirst({
          where: { orderId: order.id, status: PaymentAttemptStatus.CAPTURED },
        });
        if (alreadyCaptured) {
          return 'ALREADY_TERMINAL';
        }

        // Reuse the row for this payment id, or the latest still-open
        // attempt for this Razorpay order, or create one (webhook-before-
        // local-row case — §12.1).
        const existing = await tx.paymentAttempt.findFirst({
          where: {
            orderId: order.id,
            OR: [
              { razorpayPaymentId: captured.id },
              {
                razorpayOrderId: order.razorpayOrderId ?? undefined,
                status: PaymentAttemptStatus.INITIATED,
              },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });
        const attemptId =
          existing?.id ??
          (
            await tx.paymentAttempt.create({
              data: {
                orderId: order.id,
                razorpayOrderId:
                  order.razorpayOrderId ?? captured.razorpayOrderId,
                amountPaise: captured.amountPaise,
                currency: captured.currency,
                status: PaymentAttemptStatus.INITIATED,
              },
            })
          ).id;

        const upd = await tx.paymentAttempt.updateMany({
          where: {
            id: attemptId,
            status: { not: PaymentAttemptStatus.CAPTURED },
          },
          data: {
            status: PaymentAttemptStatus.CAPTURED,
            razorpayPaymentId: captured.id,
            method: captured.method ?? null,
            capturedAt: new Date(),
          },
        });
        if (upd.count !== 1) {
          return 'ALREADY_TERMINAL';
        }

        const transitioned = await this.transitionOrder(
          tx,
          { ...order, status: current.status },
          OrderStatus.PAID,
          null,
          'Payment captured (reconciliation)',
        );
        if (transitioned) {
          await this.insertOutboxEvent(tx, 'ORDER_PAID', order);
        }
        return 'PAID';
      });
    } catch (err) {
      if (this.isUniqueConstraintViolation(err)) {
        // A concurrent webhook/verify captured a different attempt for
        // this order between our FOR UPDATE and the CAS — the partial
        // unique index rolled us back. Not our transition to make.
        this.logger.log(
          `reconcileCapturedPayment: order ${order.id} captured concurrently — no-op`,
        );
        return 'ALREADY_TERMINAL';
      }
      throw err;
    }
  }

  /**
   * Mark a genuinely-stale, still-unpaid order PAYMENT_FAILED (Phase 13.3
   * §5). Called by reconciliation ONLY after an authoritative Razorpay
   * `fetchOrderPayments` confirmed there is no captured/authorized payment
   * for this order and the order is past the give-up threshold.
   *
   * Uses the existing state machine: PENDING_PAYMENT -> PAYMENT_FAILED is a
   * legal transition (the customer can still retry it later, exactly as
   * after a real payment failure). Not CANCELLED — the frozen §14 state
   * machine has no PENDING_PAYMENT -> CANCELLED edge, and inventing one is
   * a destructive policy change out of scope here. No financial/order rows
   * are deleted. FOR UPDATE-locked + CAS, so it's idempotent and
   * multi-instance safe.
   */
  async failStalePendingOrder(order: Order): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ status: OrderStatus }[]>`
          SELECT status FROM orders WHERE id = ${order.id} FOR UPDATE
        `;
        const current = locked[0];
        if (!current || current.status !== OrderStatus.PENDING_PAYMENT) {
          return false;
        }
        // Never fail an order that somehow has a captured attempt.
        const captured = await tx.paymentAttempt.findFirst({
          where: { orderId: order.id, status: PaymentAttemptStatus.CAPTURED },
        });
        if (captured) {
          return false;
        }

        // Bookkeeping: any still-open attempt is now abandoned.
        await tx.paymentAttempt.updateMany({
          where: {
            orderId: order.id,
            status: PaymentAttemptStatus.INITIATED,
          },
          data: { status: PaymentAttemptStatus.ABANDONED },
        });

        const transitioned = await this.transitionOrder(
          tx,
          { ...order, status: current.status },
          OrderStatus.PAYMENT_FAILED,
          null,
          'Payment not completed — order expired by reconciliation (no captured Razorpay payment)',
        );
        if (transitioned) {
          await this.insertOutboxEvent(
            tx,
            'ORDER_STATUS_CHANGED',
            order,
            OrderStatus.PAYMENT_FAILED,
          );
        }
        return transitioned !== null;
      });
    } catch (err) {
      if (this.isUniqueConstraintViolation(err)) {
        return false;
      }
      throw err;
    }
  }

  // ─── Shared helpers ─────────────────────────────────────────────────────

  /**
   * CAS transition + history row, via the existing state machine (§14) —
   * never a hand-rolled status check. Returns the updated Order if this
   * call performed the transition, or null if it was already in the
   * target/another state (safe no-op — duplicate delivery or lost race).
   */
  private async transitionOrder(
    tx: Prisma.TransactionClient | PrismaService,
    order: Order,
    to: OrderStatus,
    changedByUserId: string | null,
    note: string,
  ): Promise<Order | null> {
    const from = order.status;
    if (!isTransitionAllowed(from, to)) {
      // Programmer error (a call site attempted an illegal transition) —
      // never a client-triggerable path given how call sites guard status
      // first, but never silently allowed either (§24 invariant 11).
      throw new ConflictException(`Illegal order transition ${from} -> ${to}`);
    }
    const cas = await tx.order.updateMany({
      where: { id: order.id, status: from },
      data: { status: to },
    });
    if (cas.count !== 1) {
      return null;
    }
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: from,
        toStatus: to,
        changedByUserId,
        note,
      },
    });
    return { ...order, status: to };
  }

  /**
   * §12.2: insert only on the branch that actually performed the
   * transition (structurally that's at most once per order+transition,
   * since transitionOrder's own CAS already serializes who gets to call
   * this) — eventKey uniqueness is the backstop, not the primary
   * mechanism. Deliberately no try/catch: same reasoning as
   * applyCaptured's CAS above — swallowing a P2002 here wouldn't save the
   * surrounding transaction anyway (Postgres refuses to commit an already
   * -aborted transaction), it would just make the failure surface later
   * and less clearly. Let it propagate to the caller's outer catch.
   */
  private async insertOutboxEvent(
    tx: Prisma.TransactionClient,
    eventType: 'ORDER_PAID' | 'ORDER_STATUS_CHANGED',
    order: Order,
    toStatus?: OrderStatus,
  ): Promise<void> {
    const eventKey =
      eventType === 'ORDER_PAID'
        ? `ORDER_PAID:${order.id}`
        : `ORDER_STATUS_CHANGED:${order.id}:${toStatus}`;
    await tx.outboxEvent.create({
      data: {
        eventType,
        aggregateType: 'Order',
        aggregateId: order.id,
        eventKey,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          ...(toStatus ? { toStatus } : {}),
        },
        status: 'PENDING',
      },
    });
  }

  /** Public: WebhookProcessor needs this to classify a transaction-rollback
   * cause as a harmless capture race rather than a genuine processing
   * failure (§ see applyCaptured's comment on why the catch lives there,
   * outside the transaction). */
  isUniqueConstraintViolation(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    );
  }
}
