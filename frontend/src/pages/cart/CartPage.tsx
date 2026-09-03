import type { ReactNode } from 'react'
import { useCart } from '@/hooks/useCart'
import { getApiErrorMessage } from '@/utils/apiError'
import { ErrorState } from '@/components/ui/ErrorState'
import { Page } from '@/components/ui/Page'
import { Skeleton } from '@/components/ui/Skeleton'
import { CartLineItem } from '@/features/cart/CartLineItem'
import { CartSummary } from '@/features/cart/CartSummary'
import { EmptyCart } from '@/features/cart/EmptyCart'
import { Seo } from '@/seo/Seo'
import styles from './CartPage.module.css'

/** Behind ProtectedRoute (App.tsx) — always authenticated by the time this
 * renders. Renders exactly what GET /cart returns; every price and the
 * unavailable-item state come straight from CartView, never recomputed
 * here (§11). Private route — always noindex. */
export function CartPage() {
  const { data: cart, isPending, isError, error } = useCart()

  let body: ReactNode

  if (isPending) {
    body = (
      <Page>
        <h1>Your cart</h1>
        <div className={styles.layout}>
          <div className={styles.skeletonList} aria-busy="true" aria-label="Loading your cart">
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.skeletonRow}>
                <Skeleton className={styles.skeletonMedia} />
                <div className={styles.skeletonText}>
                  <Skeleton className={styles.skeletonLineWide} />
                  <Skeleton className={styles.skeletonLineNarrow} />
                </div>
              </div>
            ))}
          </div>
          <Skeleton className={styles.skeletonSummary} />
        </div>
      </Page>
    )
  } else if (isError) {
    body = (
      <Page>
        <ErrorState title="Your cart" message={getApiErrorMessage(error)} />
      </Page>
    )
  } else if (cart.items.length === 0) {
    body = (
      <Page>
        <EmptyCart />
      </Page>
    )
  } else {
    body = (
      <Page>
        <h1>
          Your cart{' '}
          <span className={styles.count}>
            ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'})
          </span>
        </h1>
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
      </Page>
    )
  }

  return (
    <>
      <Seo title="Your cart" noindex />
      {body}
    </>
  )
}
