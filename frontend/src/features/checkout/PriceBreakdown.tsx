import { formatPrice } from '@/utils/formatPrice'
import styles from './PriceBreakdown.module.css'

export interface PriceBreakdownProps {
  subtotal: string
  /** Provided by checkout/order/invoice views; omitted where the frontend
   * genuinely doesn't know it yet (a bare cart). */
  shippingFee?: string | null
  discountAmount?: string | null
  /** Rendered next to the discount amount when the row belongs to a view
   * that doesn't already name the coupon elsewhere. */
  couponCode?: string | null
  taxAmount?: string | null
  taxMode?: string | null
  taxRatePercent?: string | null
  total: string
}

const isPositive = (value?: string | null) =>
  value != null && Number(value) > 0

/**
 * One canonical money breakdown — subtotal, shipping, discount, tax, total
 * — used by the checkout coupon panel, the pending-payment confirmation,
 * and the order detail sidebar so the numbers and their order never differ
 * between those screens. Every value is server-authoritative and rendered
 * verbatim; nothing is computed here (§11/§17).
 */
export function PriceBreakdown({
  subtotal,
  shippingFee,
  discountAmount,
  couponCode,
  taxAmount,
  taxMode,
  taxRatePercent,
  total,
}: PriceBreakdownProps) {
  return (
    <dl className={styles.list}>
      <div className={styles.row}>
        <dt>Subtotal</dt>
        <dd>{formatPrice(subtotal)}</dd>
      </div>

      {shippingFee != null && (
        <div className={styles.row}>
          <dt>Shipping</dt>
          <dd>{Number(shippingFee) > 0 ? formatPrice(shippingFee) : 'Free'}</dd>
        </div>
      )}

      {isPositive(discountAmount) && (
        <div className={styles.row}>
          <dt>
            Discount
            {couponCode && <span className={styles.code}>{couponCode}</span>}
          </dt>
          <dd className={styles.discount}>−{formatPrice(discountAmount as string)}</dd>
        </div>
      )}

      {isPositive(taxAmount) && (
        <div className={styles.row}>
          <dt>
            GST
            {taxRatePercent ? ` (${taxRatePercent}%)` : ''}
            {taxMode === 'INCLUSIVE' ? ' · included' : ''}
          </dt>
          <dd>{formatPrice(taxAmount as string)}</dd>
        </div>
      )}

      <div className={`${styles.row} ${styles.totalRow}`}>
        <dt>Total</dt>
        <dd className={styles.total}>{formatPrice(total)}</dd>
      </div>
    </dl>
  )
}
