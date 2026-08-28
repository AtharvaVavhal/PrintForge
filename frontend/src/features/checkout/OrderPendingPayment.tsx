import type { CheckoutOrderView } from '@/types/checkout'
import { formatPrice } from '@/utils/formatPrice'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import styles from './OrderPendingPayment.module.css'

interface OrderPendingPaymentProps {
  order: CheckoutOrderView
  error: string | null
  onRetry: () => void
  isProcessing: boolean
}

/**
 * Shown once POST /checkout/orders has created the order — the shipping
 * form is gone for good at this point (the address is already snapshotted
 * onto the order), and this view persists across a dismissed/failed
 * payment attempt so the order never appears to have vanished (§13.G). The
 * "Retry Payment" action re-opens Razorpay Checkout.js via
 * POST /checkout/orders/:id/retry-payment rather than re-submitting a new
 * checkout — the same order, reusing its Razorpay order id.
 */
export function OrderPendingPayment({ order, error, onRetry, isProcessing }: OrderPendingPaymentProps) {
  return (
    <div className={styles.wrap}>
      <h2 className={styles.heading}>Order {order.orderNumber}</h2>
      <p className={styles.subheading}>
        Your order has been placed and is waiting on payment — it is not lost if you close this
        window.
      </p>

      {order.couponCode && (
        <div className={styles.discountRow}>
          <span>
            Discount (<strong>{order.couponCode}</strong>)
          </span>
          <span className={styles.discount}>−{formatPrice(order.discountAmount)}</span>
        </div>
      )}

      <div className={styles.totalRow}>
        <span>Total</span>
        <span className={styles.total}>{formatPrice(order.total)}</span>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <Button onClick={onRetry} isLoading={isProcessing} className={styles.payButton}>
        {error ? 'Retry payment' : 'Pay now'}
      </Button>
    </div>
  )
}
