import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useOrder } from '@/hooks/useOrder'
import { useRetryPayment } from '@/hooks/useRetryPayment'
import { useRazorpayCheckout } from '@/features/checkout/useRazorpayCheckout'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/utils/formatPrice'
import { getApiErrorMessage } from '@/utils/apiError'
import type { OrderStatus } from '@/types/orders'
import { ORDER_STATUS_LABELS, orderStatusTone } from '@/features/orders/orderStatus'
import styles from './OrderDetailPage.module.css'

const RETRYABLE_STATUSES = new Set<OrderStatus>(['PENDING_PAYMENT', 'PAYMENT_FAILED'])

/**
 * GET /orders/:id — the destination after checkout's Razorpay flow, and
 * also where a "Retry Payment" action (from a payment that failed or was
 * dismissed) lives. This page never trusts POST /payments/verify's
 * response for what to display; it only ever renders `order.status` from
 * its own fetch, which useOrder keeps polling while PENDING_PAYMENT so it
 * catches up once the webhook (the authoritative path, §13.G) lands.
 */
export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: order, isPending, isError, error, refetch } = useOrder(id!)
  const retryPayment = useRetryPayment()
  const [paymentError, setPaymentError] = useState<string | null>(null)
  // See CheckoutPage.tsx's startPayment for why this must be a ref, not a
  // retryPayment.isPending check — a synchronous double-click's second call
  // lands on the same pre-re-render closure as the first, so an isPending
  // read would still see the stale (false) value.
  const isRetryingRef = useRef(false)

  const { openCheckout, isOpening, isVerifying } = useRazorpayCheckout({
    onVerified: () => {
      void refetch()
    },
    onDismissed: () =>
      setPaymentError('Payment was not completed. Your order is still here — you can retry anytime.'),
    onError: setPaymentError,
  })

  async function handleRetry() {
    if (isRetryingRef.current) return
    if (!order) return
    isRetryingRef.current = true
    setPaymentError(null)
    try {
      const payment = await retryPayment.mutateAsync(order.id)
      await openCheckout(
        payment,
        { orderNumber: order.orderNumber },
        { name: order.shippingRecipientName, contact: order.shippingPhone },
      )
    } catch (err) {
      setPaymentError(getApiErrorMessage(err))
    } finally {
      isRetryingRef.current = false
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

  const canRetryPayment = RETRYABLE_STATUSES.has(order.status)

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <h1>Order {order.orderNumber}</h1>
        <span className={styles.statusBadge} data-tone={orderStatusTone(order.status)}>
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>

      {order.status === 'PENDING_PAYMENT' && (
        <Alert variant="info">
          We&rsquo;re confirming your payment — this can take a few moments. This page will update
          automatically.
        </Alert>
      )}

      {canRetryPayment && (
        <div className={styles.retryBlock}>
          {paymentError && <Alert variant="error">{paymentError}</Alert>}
          <Button onClick={() => void handleRetry()} isLoading={retryPayment.isPending || isOpening || isVerifying}>
            {order.status === 'PAYMENT_FAILED' ? 'Retry payment' : 'Pay now'}
          </Button>
        </div>
      )}

      <div className={styles.layout}>
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

        <div className={styles.sidebar}>
          <div className={styles.summaryBlock}>
            <div className={styles.row}>
              <span>Subtotal</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className={styles.row}>
              <span>Total</span>
              <span className={styles.total}>{formatPrice(order.total)}</span>
            </div>
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
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
