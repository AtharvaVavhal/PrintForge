import { useCart } from '@/hooks/useCart'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import { Skeleton } from '@/components/ui/Skeleton'
import { CartLineItem } from '@/features/cart/CartLineItem'
import { CartSummary } from '@/features/cart/CartSummary'
import { EmptyCart } from '@/features/cart/EmptyCart'
import styles from './CartPage.module.css'

/** Behind ProtectedRoute (App.tsx) — always authenticated by the time this
 * renders. Renders exactly what GET /cart returns; every price and the
 * unavailable-item state come straight from CartView, never recomputed
 * here (§11). */
export function CartPage() {
  const { data: cart, isPending, isError, error } = useCart()

  if (isPending) {
    return (
      <section className={styles.wrap}>
        <h1>Your cart</h1>
        <div className={styles.skeletonList}>
          <Skeleton className={styles.skeletonLine} />
          <Skeleton className={styles.skeletonLine} />
          <Skeleton className={styles.skeletonLine} />
        </div>
      </section>
    )
  }

  if (isError) {
    return (
      <section className={styles.wrap}>
        <h1>Your cart</h1>
        <Alert variant="error">{getApiErrorMessage(error)}</Alert>
      </section>
    )
  }

  if (cart.items.length === 0) {
    return (
      <section className={styles.wrap}>
        <EmptyCart />
      </section>
    )
  }

  return (
    <section className={styles.wrap}>
      <h1>Your cart</h1>
      <div className={styles.layout}>
        <ul className={styles.lines}>
          {cart.items.map((item) => (
            <CartLineItem key={item.id} item={item} />
          ))}
        </ul>
        <CartSummary
          subtotal={cart.subtotal}
          itemCount={cart.itemCount}
          hasUnavailableItems={cart.items.some((item) => !item.isAvailable)}
        />
      </div>
    </section>
  )
}
