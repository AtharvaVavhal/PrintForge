import type { CartView } from '@/types/cart'
import { formatPrice } from '@/utils/formatPrice'
import styles from './CheckoutCartSummary.module.css'

interface CheckoutCartSummaryProps {
  cart: CartView
}

/** Read-only review of the cart being checked out — every price comes
 * straight from CartView, never recomputed here (§11); the order the
 * backend creates re-prices everything server-side regardless. */
export function CheckoutCartSummary({ cart }: CheckoutCartSummaryProps) {
  return (
    <div className={styles.wrap}>
      <h2 className={styles.heading}>Order summary</h2>
      <ul className={styles.lines}>
        {cart.items.map((item) => (
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
      <div className={styles.subtotalRow}>
        <span>Subtotal</span>
        <span className={styles.subtotal}>{formatPrice(cart.subtotal)}</span>
      </div>
      <p className={styles.note}>
        Shipping, any discount, and tax are calculated when you place the order.
      </p>
    </div>
  )
}
