import { randomUUID } from 'crypto';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Order,
  OrderStatus,
  PaymentAttemptStatus,
  Prisma,
  RefundStatus,
} from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { PaginatedResult } from '../common/types/api-response.interface';
import { Role } from '../common/enums/role.enum';
import {
  decimalToPaise,
  paiseToDecimalString,
} from '../cart/pricing/money.util';
import { NotificationsService } from '../notifications/notifications.service';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { ListAdminOrdersQueryDto } from '../admin/dto/list-admin-orders-query.dto';
import { UpdateOrderStatusDto } from '../admin/dto/update-order-status.dto';
import {
  OrderDetailView,
  OrderListItemView,
  OrderStatusHistoryView,
  PaymentAttemptView,
  RefundView,
} from './dto/order-view.interface';
import {
  assertTransitionAllowed,
  orderNeedsRefund,
} from './order-lifecycle.util';

const ORDER_NUMBER_COUNTER_KEY = 'order_number_counter';

interface Actor {
  role: Role;
  actorId: string;
}

const ORDER_LIST_INCLUDE = {
  items: { select: { quantity: true } },
  paymentAttempts: {
    select: {
      refunds: {
        where: { status: RefundStatus.PENDING },
        select: { id: true },
      },
    },
  },
} satisfies Prisma.OrderInclude;

type OrderListRow = Prisma.OrderGetPayload<{
  include: typeof ORDER_LIST_INCLUDE;
}>;

const ORDER_DETAIL_INCLUDE = {
  items: {
    include: { customizations: true },
    orderBy: { id: 'asc' as const },
  },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  paymentAttempts: {
    include: { refunds: true },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.OrderInclude;

type OrderWithDetail = Prisma.OrderGetPayload<{
  include: typeof ORDER_DETAIL_INCLUDE;
}>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * §37 TODO ("Order-number generation mechanism — Postgres sequence or a
   * locked counter row in app_settings; either is acceptable, pick one
   * during Phase 1" — never picked): implemented as the app_settings
   * option, via an atomic INSERT...ON CONFLICT DO UPDATE...RETURNING
   * against a counter row — race-safe under concurrent checkouts without a
   * separate lock statement, no migration needed since app_settings
   * already exists (§15).
   *
   * Must be called with the caller's own transaction client so the
   * increment commits/rolls back atomically with the Order it numbers —
   * checkout owns order creation (§17); this is the one thing orders
   * exposes for it to consume (the checkout→orders dependency arrow, §17).
   */
  async generateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const rows = await tx.$queryRaw<{ value: string }[]>`
      INSERT INTO app_settings (id, key, value, "updatedAt")
      VALUES (${randomUUID()}, ${ORDER_NUMBER_COUNTER_KEY}, '1', now())
      ON CONFLICT (key) DO UPDATE
        SET value = (app_settings.value::integer + 1)::text, "updatedAt" = now()
      RETURNING value
    `;
    const counter = rows[0].value;
    return `PF-${counter.padStart(6, '0')}`;
  }

  /**
   * Reviews' verified-purchase gate (PHASE-10-PROPOSAL.md §1.1/R1) — the
   * exact OrderItem, on a DELIVERED order, that proves this user bought
   * this specific product. Exposed here rather than ReviewsService reaching
   * into order/order-item tables directly, matching this codebase's
   * convention of routing a cross-module read through the owning module's
   * service (e.g. checkout calls `generateOrderNumber` above rather than
   * hand-rolling its own counter logic). Takes the caller's own transaction
   * client, same reason `generateOrderNumber` does: the eligibility check
   * has to compose atomically with whatever the caller does next inside
   * its own transaction (here, creating the Review), not run as a separate
   * pre-check a concurrent write could invalidate in between. Any
   * qualifying item is sufficient — which one doesn't matter, since it's
   * the same product either way.
   */
  async findDeliveredOrderItemForProduct(
    tx: Prisma.TransactionClient,
    userId: string,
    productId: string,
  ): Promise<{ id: string } | null> {
    return tx.orderItem.findFirst({
      where: {
        productId,
        order: { userId, status: OrderStatus.DELIVERED },
      },
      select: { id: true },
    });
  }

  // ─── Customer-facing (GET /orders, GET /orders/:id, POST /orders/:id/cancel) ──

  async listOrdersForUser(
    userId: string,
    query: ListOrdersQueryDto,
  ): Promise<PaginatedResult<OrderListItemView>> {
    const where: Prisma.OrderWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };
    return this.paginatedList(where, query.page, query.limit);
  }

  async getOrderDetailForUser(
    userId: string,
    orderId: string,
  ): Promise<OrderDetailView> {
    const order = await this.findOrderDetailOrThrow(orderId);
    this.assertOwnedBy(order, userId);
    return this.toDetailView(order);
  }

  /**
   * Not in §20's frozen contract (no `POST /orders/:id/cancel` row there,
   * and §14's state diagram only ever labels CANCELLED transitions "admin
   * cancels") — implemented anyway per this phase's explicit instruction,
   * as a deliberate extension. Flagged in the completion report rather
   * than silently added.
   */
  async cancelOrder(
    userId: string,
    orderId: string,
    dto: CancelOrderDto,
  ): Promise<OrderDetailView> {
    const order = await this.findOrderOrThrow(orderId);
    this.assertOwnedBy(order, userId);

    if (order.status === OrderStatus.CANCELLED) {
      // Idempotent: already cancelled, no duplicate side effects (§20's
      // CAS-idempotent convention applied here too).
      return this.getOrderDetailForUser(userId, orderId);
    }
    assertTransitionAllowed(order.status, OrderStatus.CANCELLED);

    await this.performCancellation(
      order,
      { role: Role.CUSTOMER, actorId: userId },
      dto.reason,
    );
    return this.getOrderDetailForUser(userId, orderId);
  }

  // ─── Admin-facing (GET/PATCH /admin/orders[/:id], PATCH .../status) ───────

  async adminListOrders(
    query: ListAdminOrdersQueryDto,
  ): Promise<PaginatedResult<OrderListItemView>> {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };
    return this.paginatedList(where, query.page, query.limit);
  }

  async adminGetOrderDetail(orderId: string): Promise<OrderDetailView> {
    const order = await this.findOrderDetailOrThrow(orderId);
    return this.toDetailView(order);
  }

  /**
   * GET /admin/dashboard's recent-orders panel (§19, "minimal — no
   * charts"). Same view assembly as the paginated admin/customer lists —
   * one findMany, no separate count query since the dashboard has no
   * pagination to report.
   */
  async adminRecentOrders(limit: number): Promise<OrderListItemView[]> {
    const rows = await this.prisma.order.findMany({
      include: ORDER_LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => this.toListItemView(row));
  }

  /**
   * §20: "Already-applied transition → 200; illegal → 409." Cancelling an
   * order with a captured payment flags it for manual refund (see
   * performCancellation) rather than calling Razorpay — same "record
   * only, refund processed manually in the Razorpay dashboard" semantics
   * §13.L already specifies for a direct admin transition to REFUNDED.
   */
  async adminTransitionStatus(
    adminId: string,
    orderId: string,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderDetailView> {
    const order = await this.findOrderOrThrow(orderId);

    if (order.status === dto.status) {
      return this.adminGetOrderDetail(orderId);
    }
    assertTransitionAllowed(order.status, dto.status);

    const actor: Actor = { role: Role.ADMIN, actorId: adminId };
    if (dto.status === OrderStatus.CANCELLED) {
      await this.performCancellation(order, actor, dto.reason);
    } else if (dto.status === OrderStatus.REFUNDED) {
      await this.performRefundRecording(order, actor, dto.reason);
    } else {
      await this.prisma.$transaction((tx) =>
        this.transitionOrderWithHistory(
          tx,
          order,
          dto.status,
          actor,
          dto.reason,
        ),
      );
    }
    return this.adminGetOrderDetail(orderId);
  }

  // ─── Cancellation + manual-refund flagging ─────────────────────────────

  /**
   * §12.5 as originally frozen: "no in-app refund-initiation API in MVP."
   * Cancelling an order that had a captured payment does NOT call
   * Razorpay — it flags the refund for manual processing by writing a
   * `Refund` row with status PENDING and no `razorpayRefundId` (the
   * existing model already fits this exactly: "owed, not yet processed
   * via our API" — no separate boolean needed anywhere). That row is what
   * makes `needsManualRefund` true in both GET /orders/:id and GET
   * /admin/orders[/:id] (see toListItemView/toDetailView), so ops can spot
   * it and action the refund by hand in the Razorpay dashboard. Everything
   * (Refund row + order CAS + history + outbox) commits in one
   * transaction — no external call is interleaved anymore, so unlike
   * Phase 6's payment flows there's nothing that has to sit outside it.
   */
  private async performCancellation(
    order: Order,
    actor: Actor,
    reason: string | undefined,
  ): Promise<void> {
    const capturedAttempt = await this.prisma.paymentAttempt.findFirst({
      where: { orderId: order.id, status: PaymentAttemptStatus.CAPTURED },
    });
    const needsManualRefund = orderNeedsRefund(capturedAttempt);

    await this.prisma.$transaction(async (tx) => {
      if (needsManualRefund) {
        await tx.refund.create({
          data: {
            paymentAttemptId: capturedAttempt!.id,
            amountPaise: capturedAttempt!.amountPaise,
            status: RefundStatus.PENDING,
            reason: reason ?? null,
          },
        });
      }
      await this.transitionOrderWithHistory(
        tx,
        order,
        OrderStatus.CANCELLED,
        actor,
        reason,
        needsManualRefund,
      );
    });
  }

  /**
   * §13.L / §32: "no in-app refund-initiation API in MVP" — a direct admin
   * transition to REFUNDED only *records* that a refund already happened
   * manually in the Razorpay dashboard. Closes the loop performCancellation
   * opened: whichever Refund row it left PENDING for this order is marked
   * PROCESSED here, in the same transaction as the order CAS + history +
   * outbox. `updateMany` is a safe no-op if there isn't one — a direct
   * PAID/CONFIRMED/IN_PRODUCTION/SHIPPED/DELIVERED -> REFUNDED transition
   * with no prior cancellation never had a PENDING Refund row to begin
   * with, and this phase doesn't invent one (no in-app refund creation).
   */
  private async performRefundRecording(
    order: Order,
    actor: Actor,
    reason: string | undefined,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.refund.updateMany({
        where: {
          status: RefundStatus.PENDING,
          paymentAttempt: { orderId: order.id },
        },
        data: { status: RefundStatus.PROCESSED },
      });
      await this.transitionOrderWithHistory(
        tx,
        order,
        OrderStatus.REFUNDED,
        actor,
        reason,
      );
    });
  }

  /**
   * CAS + history + outbox, via the existing state machine (§14) —
   * every transition, customer or admin, goes through this one place.
   * `cas.count !== 1` (lost a race — someone else already transitioned
   * it) is a safe no-op, not an error, matching Phase 5/6's convention.
   * `refundPending` only ever comes from performCancellation — it flows
   * into the history note and the outbox payload so the notification
   * email can say a refund is being processed by our team, never that one
   * was automatically triggered.
   */
  private async transitionOrderWithHistory(
    tx: Prisma.TransactionClient,
    order: Order,
    to: OrderStatus,
    actor: Actor,
    reason: string | undefined,
    refundPending = false,
  ): Promise<void> {
    assertTransitionAllowed(order.status, to);

    const cas = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: to },
    });
    if (cas.count !== 1) {
      return;
    }

    const defaultNote = refundPending
      ? `Order ${to.toLowerCase()} — refund pending manual processing`
      : `Order ${to.toLowerCase()}`;
    const note = `[${actor.role}] ${reason?.trim() || defaultNote}`;
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: to,
        changedByUserId: actor.actorId,
        note,
      },
    });

    // §12.2: denormalized snapshot captured at insert time, including the
    // recipient email — "the processor never re-queries business tables."
    const user = await tx.user.findUniqueOrThrow({
      where: { id: order.userId },
      select: { email: true },
    });
    await this.notificationsService.enqueueOutboxEvent(tx, {
      eventType: 'ORDER_STATUS_CHANGED',
      aggregateType: 'Order',
      aggregateId: order.id,
      eventKey: `ORDER_STATUS_CHANGED:${order.id}:${to}`,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        email: user.email,
        fromStatus: order.status,
        toStatus: to,
        ...(refundPending ? { refundPending: true } : {}),
      },
    });
  }

  // ─── Shared read helpers ────────────────────────────────────────────────

  private async paginatedList(
    where: Prisma.OrderWhereInput,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<OrderListItemView>> {
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.toListItemView(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  private async findOrderOrThrow(orderId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  private async findOrderDetailOrThrow(
    orderId: string,
  ): Promise<OrderWithDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  /** 403, not 404, for a wrong-owner access — explicit choice for this
   * phase's customer-facing routes (distinct from other modules' "identical
   * to nonexistent" convention elsewhere in this codebase). */
  private assertOwnedBy(order: { userId: string }, userId: string): void {
    if (order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }
  }

  // ─── View assembly ──────────────────────────────────────────────────────

  private toListItemView(order: OrderListRow): OrderListItemView {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: paiseToDecimalString(decimalToPaise(order.total)),
      currency: order.currency,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      needsManualRefund: order.paymentAttempts.some(
        (pa) => pa.refunds.length > 0,
      ),
      createdAt: order.createdAt,
    };
  }

  private toDetailView(order: OrderWithDetail): OrderDetailView {
    const statusHistory: OrderStatusHistoryView[] = order.statusHistory.map(
      (h) => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        changedByUserId: h.changedByUserId,
        note: h.note,
        createdAt: h.createdAt,
      }),
    );

    const paymentAttempts: PaymentAttemptView[] = order.paymentAttempts.map(
      (attempt) => {
        const refunds: RefundView[] = attempt.refunds.map((refund) => ({
          id: refund.id,
          amountPaise: refund.amountPaise.toString(),
          status: refund.status,
          reason: refund.reason,
          createdAt: refund.createdAt,
        }));
        return {
          id: attempt.id,
          status: attempt.status,
          amountPaise: attempt.amountPaise.toString(),
          method: attempt.method,
          failureCode: attempt.failureCode,
          failureReason: attempt.failureReason,
          createdAt: attempt.createdAt,
          capturedAt: attempt.capturedAt,
          refunds,
        };
      },
    );

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      subtotal: paiseToDecimalString(decimalToPaise(order.subtotal)),
      total: paiseToDecimalString(decimalToPaise(order.total)),
      shippingFee: paiseToDecimalString(decimalToPaise(order.shippingFee)),
      discountAmount: paiseToDecimalString(
        decimalToPaise(order.discountAmount),
      ),
      couponCode: order.couponCode,
      currency: order.currency,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      needsManualRefund: order.paymentAttempts.some((attempt) =>
        attempt.refunds.some(
          (refund) => refund.status === RefundStatus.PENDING,
        ),
      ),
      shippingRecipientName: order.shippingRecipientName,
      shippingPhone: order.shippingPhone,
      shippingAddressLine1: order.shippingAddressLine1,
      shippingAddressLine2: order.shippingAddressLine2,
      shippingCity: order.shippingCity,
      shippingState: order.shippingState,
      shippingPostalCode: order.shippingPostalCode,
      shippingCountry: order.shippingCountry,
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productNameSnapshot,
        variantLabel: item.variantLabelSnapshot,
        unitPrice: paiseToDecimalString(decimalToPaise(item.unitPriceSnapshot)),
        quantity: item.quantity,
        lineTotal: paiseToDecimalString(decimalToPaise(item.lineTotal)),
        customizations: item.customizations.map((c) => ({
          fieldLabel: c.fieldLabelSnapshot,
          textValue: c.textValue,
          uploadedFileId: c.uploadedFileId,
        })),
      })),
      statusHistory,
      paymentAttempts,
    };
  }
}
