import { Link, useParams } from 'react-router-dom'
import { useAdminOrder } from '@/hooks/useAdminOrder'
import { orderInvoicePath } from '@/constants/routes'
import { useUpdateAdminOrderStatus } from '@/hooks/useUpdateAdminOrderStatus'
import { OrderStatusForm } from '@/features/admin/OrderStatusForm'
import { Alert } from '@/components/ui/Alert'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/utils/formatPrice'
import { formatDate } from '@/utils/formatDate'
import { getApiErrorMessage } from '@/utils/apiError'
import { ORDER_STATUS_LABELS, orderStatusTone } from '@/features/orders/orderStatus'
import type { OrderStatus } from '@/types/orders'
import styles from './AdminOrderDetailPage.module.css'

/**
 * Behind AdminRoute (App.tsx). GET /admin/orders/:id — confirmed live to
 * be the exact same OrderDetailView shape as the customer-facing GET
 * /orders/:id (needsManualRefund included, nothing admin-only layered on
 * top). The status-change control submits whatever the admin picks and
 * relies entirely on the backend's 409 to reject an illegal transition —
 * see OrderStatusForm's doc comment for why this never duplicates
 * order-state-machine.ts client-side.
 */
const INVOICEABLE_STATUSES = new Set<OrderStatus>([
  'PAID',
  'CONFIRMED',
  'IN_PRODUCTION',
  'SHIPPED',
  'DELIVERED',
  'REFUNDED',
])

export function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: order, isPending, isError, error } = useAdminOrder(id!)
  const updateStatus = useUpdateAdminOrderStatus(id!)

  async function handleStatusSubmit(status: OrderStatus, reason: string) {
    try {
      await updateStatus.mutateAsync(reason ? { status, reason } : { status })
    } catch {
      // Error is read off updateStatus.error and rendered inside
      // OrderStatusForm, which stays mounted either way.
    }
  }

  if (isPending) {
    return (
      <section className={styles.wrap}>
        <h1>Order</h1>
        <Skeleton className={styles.skeletonBlock} />
      </section>
    )
  }

  if (isError) {
    return (
      <section className={styles.wrap}>
        <h1>Order</h1>
        <Alert variant="error">{getApiErrorMessage(error)}</Alert>
      </section>
    )
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <h1>Order {order.orderNumber}</h1>
        <span className={styles.statusBadge} data-tone={orderStatusTone(order.status)}>
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>

      {order.needsManualRefund && (
        <Alert variant="error">
          This order has a refund pending manual processing — action it in the Razorpay dashboard, then mark the
          order Refunded here to close it out.
        </Alert>
      )}

      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.summaryBlock}>
            <h2 className={styles.heading}>Items</h2>
            <ul className={styles.lines}>
              {order.items.map((item) => (
                <li key={item.id} className={styles.line}>
                  <div>
                    <p className={styles.name}>{item.productName}</p>
                    {item.variantLabel && <p className={styles.meta}>{item.variantLabel}</p>}
                    <p className={styles.meta}>Qty {item.quantity}</p>
                  </div>
                  <span className={styles.lineTotal}>{formatPrice(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className={styles.row}>
              <span>Subtotal</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            {order.couponCode && (
              <div className={styles.row}>
                <span>
                  Discount (<strong>{order.couponCode}</strong>)
                </span>
                <span className={styles.discount}>−{formatPrice(order.discountAmount)}</span>
              </div>
            )}
            {Number(order.taxAmount) > 0 && (
              <div className={styles.row}>
                <span>
                  GST{order.taxRatePercent ? ` (${order.taxRatePercent}%)` : ''}
                  {order.taxMode === 'INCLUSIVE' ? ' — included' : ''}
                </span>
                <span>{formatPrice(order.taxAmount)}</span>
              </div>
            )}
            <div className={styles.row}>
              <span>Total</span>
              <span className={styles.total}>{formatPrice(order.total)}</span>
            </div>
            {INVOICEABLE_STATUSES.has(order.status) && (
              <p className={styles.invoiceLink}>
                <Link to={orderInvoicePath(order.id)}>View / print invoice</Link>
              </p>
            )}
          </div>

          <div className={styles.summaryBlock}>
            <h2 className={styles.heading}>Shipping to</h2>
            <p className={styles.address}>
              {order.shippingRecipientName}
              <br />
              {order.shippingAddressLine1}
              {order.shippingAddressLine2 && (
                <>
                  <br />
                  {order.shippingAddressLine2}
                </>
              )}
              <br />
              {order.shippingCity}, {order.shippingState} {order.shippingPostalCode}
              <br />
              {order.shippingCountry}
              <br />
              {order.shippingPhone}
            </p>
          </div>

          <div className={styles.summaryBlock}>
            <h2 className={styles.heading}>Status history</h2>
            {order.statusHistory.length === 0 ? (
              <p className={styles.meta}>No history yet.</p>
            ) : (
              <ul className={styles.historyList}>
                {order.statusHistory.map((entry, index) => (
                  <li key={index} className={styles.historyRow}>
                    <span>
                      {entry.fromStatus ? `${ORDER_STATUS_LABELS[entry.fromStatus]} → ` : ''}
                      {ORDER_STATUS_LABELS[entry.toStatus]}
                    </span>
                    <span className={styles.meta}>{formatDate(entry.createdAt)}</span>
                    {entry.note && <span className={styles.note}>{entry.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {order.paymentAttempts.length > 0 && (
            <div className={styles.summaryBlock}>
              <h2 className={styles.heading}>Payment attempts</h2>
              <ul className={styles.historyList}>
                {order.paymentAttempts.map((attempt) => (
                  <li key={attempt.id} className={styles.historyRow}>
                    <span>{attempt.status}</span>
                    <span className={styles.meta}>{formatPrice((Number(attempt.amountPaise) / 100).toFixed(2))}</span>
                    {attempt.failureReason && <span className={styles.note}>{attempt.failureReason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={styles.sidebar}>
          <OrderStatusForm
            currentStatus={order.status}
            isSubmitting={updateStatus.isPending}
            submitError={updateStatus.isError ? getApiErrorMessage(updateStatus.error) : null}
            onSubmit={(status, reason) => void handleStatusSubmit(status, reason)}
          />
        </div>
      </div>
    </section>
  )
}
