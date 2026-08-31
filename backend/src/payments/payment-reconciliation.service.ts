import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/database/prisma.service';
import { PaymentAttemptStatus } from '@prisma/client';
import * as Sentry from '@sentry/node';

interface StalePaymentOrder {
  id: string;
  orderNumber: string;
  razorpayOrderId: string | null;
  status: string;
  updatedAt: Date;
  latestAttemptStatus: PaymentAttemptStatus | null;
  latestAttemptAge: number | null;
  webhookExists: boolean;
}

/**
 * Observe-only payment reconciliation cron.
 *
 * DOES NOT auto-create or auto-retry PaymentAttempts.
 * Only detects stale/anomalous PENDING_PAYMENT orders and emits alerts.
 *
 * Detection criteria:
 * - Order status = PENDING_PAYMENT
 * - Has razorpayOrderId (payment was initiated)
 * - No CAPTURED PaymentAttempt
 * - Latest INITIATED attempt is older than threshold (default 15 min)
 * - No recent webhook event for this razorpayOrderId (optional check)
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  // Threshold in minutes after which an INITIATED attempt is considered stale
  private readonly STALE_THRESHOLD_MINUTES = 15;

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcile(): Promise<void> {
    try {
      const staleOrders = await this.findStaleOrders();

      if (staleOrders.length === 0) {
        this.logger.debug('Payment reconciliation: no stale orders found');
        return;
      }

      this.logger.warn(`Payment reconciliation: found ${staleOrders.length} stale PENDING_PAYMENT order(s)`);

      for (const order of staleOrders) {
        this.alertStaleOrder(order);
      }
    } catch (error) {
      this.logger.error('Payment reconciliation cron failed', error instanceof Error ? error.stack : error);
      Sentry.captureException(error);
    }
  }

  private async findStaleOrders(): Promise<StalePaymentOrder[]> {
    const thresholdDate = new Date(Date.now() - this.STALE_THRESHOLD_MINUTES * 60 * 1000);

    // Find PENDING_PAYMENT orders with razorpayOrderId but no CAPTURED attempt
    const orders = await this.prisma.order.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        razorpayOrderId: { not: null },
        paymentAttempts: {
          none: { status: 'CAPTURED' },
        },
      },
      include: {
        paymentAttempts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const results: StalePaymentOrder[] = [];

    for (const order of orders) {
      const latestAttempt = order.paymentAttempts[0] ?? null;
      const latestAttemptAge = latestAttempt
        ? (Date.now() - latestAttempt.createdAt.getTime()) / (1000 * 60)
        : null;

      // Check if latest attempt is stale
      if (latestAttemptAge !== null && latestAttemptAge > this.STALE_THRESHOLD_MINUTES) {
        // Check for recent webhook events
        const webhookExists = order.razorpayOrderId
          ? await this.prisma.webhookEvent.findFirst({
              where: {
                payload: {
                  path: ['payload', 'payment', 'entity', 'order_id'],
                  equals: order.razorpayOrderId,
                },
                createdAt: { gte: thresholdDate },
              },
            })
          : null;

        results.push({
          id: order.id,
          orderNumber: order.orderNumber,
          razorpayOrderId: order.razorpayOrderId,
          status: order.status,
          updatedAt: order.updatedAt,
          latestAttemptStatus: latestAttempt?.status ?? null,
          latestAttemptAge,
          webhookExists: !!webhookExists,
        });
      }
    }

    return results;
  }

  private alertStaleOrder(order: StalePaymentOrder): void {
    const message = `Stale PENDING_PAYMENT order detected: ${order.orderNumber} (${order.id})`;

    this.logger.warn(message, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      razorpayOrderId: order.razorpayOrderId,
      latestAttemptStatus: order.latestAttemptStatus,
      latestAttemptAgeMinutes: order.latestAttemptAge?.toFixed(1),
      webhookExists: order.webhookExists,
      orderUpdatedAt: order.updatedAt.toISOString(),
    });

    Sentry.captureMessage(message, {
      level: 'warning',
      extra: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        razorpayOrderId: order.razorpayOrderId,
        latestAttemptStatus: order.latestAttemptStatus,
        latestAttemptAgeMinutes: order.latestAttemptAge?.toFixed(1),
        webhookExists: order.webhookExists,
        orderUpdatedAt: order.updatedAt.toISOString(),
      },
      tags: {
        reconciliation: 'payment_stale',
      },
    });
  }
}