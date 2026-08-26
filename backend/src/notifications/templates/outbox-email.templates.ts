import { OutboxEventType } from '@prisma/client';

export interface EmailContent {
  subject: string;
  html: string;
}

/**
 * Minimal content builders per outbox event type — plain interpolated
 * HTML, no templating engine (three short, static-shaped emails don't
 * warrant one). Pure and unit-testable: takes the event's own
 * denormalized payload (§12.2 — "the processor never re-queries business
 * tables"), returns null for an event type with nothing to send so the
 * poller can mark it SENT without erroring.
 */
export function buildEmailContent(
  eventType: OutboxEventType,
  payload: Record<string, unknown>,
): EmailContent | null {
  switch (eventType) {
    case 'PASSWORD_RESET_REQUESTED':
      return buildPasswordResetEmail(payload);
    case 'ORDER_PAID':
      return buildOrderPaidEmail(payload);
    case 'ORDER_STATUS_CHANGED':
      return buildOrderStatusChangedEmail(payload);
    default:
      return null;
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function buildPasswordResetEmail(
  payload: Record<string, unknown>,
): EmailContent {
  const resetLink = asString(payload.resetLink);
  return {
    subject: 'Reset your PrintForge password',
    html: `
      <p>We received a request to reset your PrintForge password.</p>
      <p><a href="${resetLink}">Click here to reset your password</a>. This link expires in 30 minutes.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `.trim(),
  };
}

function buildOrderPaidEmail(payload: Record<string, unknown>): EmailContent {
  const orderNumber = asString(payload.orderNumber);
  return {
    subject: `Order ${orderNumber} confirmed`,
    html: `
      <p>Thanks for your order! We've received your payment for order <strong>${orderNumber}</strong>.</p>
      <p>We'll let you know as your order moves through production.</p>
    `.trim(),
  };
}

/**
 * `refundPending` (set only by OrdersService.performCancellation, §12.5:
 * no in-app refund-initiation) must never read as "a refund was
 * automatically triggered" — it wasn't; ops process it by hand in the
 * Razorpay dashboard. This copy says so explicitly rather than implying
 * anything automatic happened.
 */
function buildOrderStatusChangedEmail(
  payload: Record<string, unknown>,
): EmailContent {
  const orderNumber = asString(payload.orderNumber);
  const toStatus = asString(payload.toStatus);
  const refundPending = payload.refundPending === true;
  const refundNote = refundPending
    ? '<p>A refund for this order is being processed by our team and will be completed shortly — no action is needed from you.</p>'
    : '';
  return {
    subject: `Order ${orderNumber} update: ${formatStatus(toStatus)}`,
    html: `
      <p>Your order <strong>${orderNumber}</strong> is now <strong>${formatStatus(toStatus)}</strong>.</p>
      ${refundNote}
    `.trim(),
  };
}

function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
