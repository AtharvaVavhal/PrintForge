import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { formatPrice } from '@/utils/formatPrice'
import { ROUTES } from '@/constants/routes'
import styles from './CartSummary.module.css'

interface CartSummaryProps {
  subtotal: string
  itemCount: number
  hasUnavailableItems: boolean
}

/** Checkout is blocked while any line is unavailable (§10/§20: an
 * unavailable item is a distinct, visible state — not something the
 * customer can just check out through). Subtotal is server-computed
 * (CartView.subtotal), rendered as-is, never recomputed here. */
export function CartSummary({ subtotal, itemCount, hasUnavailableItems }: CartSummaryProps) {
  return (
    <div className={styles.summary}>
      <div className={styles.row}>
        <span>Items</span>
        <span>{itemCount}</span>
      </div>
      <div className={styles.row}>
        <span>Subtotal</span>
        <span className={styles.subtotal}>{formatPrice(subtotal)}</span>
      </div>

      {hasUnavailableItems && (
        <Alert variant="error">
          Remove the unavailable item(s) above before checking out.
        </Alert>
      )}

      {hasUnavailableItems ? (
        <Button disabled className={styles.checkoutButton}>
          Proceed to checkout
        </Button>
      ) : (
        <Link to={ROUTES.CHECKOUT} className={styles.checkoutLink}>
          <Button className={styles.checkoutButton}>Proceed to checkout</Button>
        </Link>
      )}
    </div>
  )
}
