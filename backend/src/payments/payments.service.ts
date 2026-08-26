import { randomUUID } from 'crypto';
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
  status: string;
  method?: string;
  error_code?: string;
  error_description?: string;
}

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
    await this.prisma.$queryRaw`
      INSERT INTO webhook_events (id, "razorpayEventId", payload, status, "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${razorpayEventId}, ${JSON.stringify(payload)}::jsonb, 'RECEIVED', now(), now())
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
    // §12.1 defense-in-depth, non-blocking: log/alert on mismatch only.
    const expectedPaise = decimalToPaise(order.total);
    const actualPaise = BigInt(paymentEntity.amount);
    if (expectedPaise !== actualPaise) {
      this.logger.warn(
        `Amount mismatch on captured payment for order ${order.id}: expected ${expectedPaise}, got ${actualPaise}`,
      );
    }

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
