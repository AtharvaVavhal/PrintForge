import { useSearchParams } from 'react-router-dom'
import { useOrders } from '@/hooks/useOrders'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { EmptyOrders } from '@/features/orders/EmptyOrders'
import { OrderListRow } from '@/features/orders/OrderListRow'
import { OrderListSkeleton } from '@/features/orders/OrderListSkeleton'
import styles from './OrdersPage.module.css'

const DEFAULT_LIMIT = 20

/** Behind ProtectedRoute (App.tsx). GET /orders is already sorted
 * newest-first server-side (orders.service.ts) — no client-side sort. */
export function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Number(searchParams.get('page') ?? '1')

  const ordersQuery = useOrders({ page, limit: DEFAULT_LIMIT })

  function goToPage(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('page', String(nextPage))
      return next
    })
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <h1>Your orders</h1>
        {ordersQuery.data && ordersQuery.data.items.length > 0 && (
          <p className={styles.count}>
            {ordersQuery.data.meta.total}{' '}
            {ordersQuery.data.meta.total === 1 ? 'order' : 'orders'}
          </p>
        )}
      </div>

      {ordersQuery.isPending && <OrderListSkeleton />}

      {ordersQuery.isError && <Alert variant="error">{getApiErrorMessage(ordersQuery.error)}</Alert>}

      {ordersQuery.data && ordersQuery.data.items.length === 0 && <EmptyOrders />}

      {ordersQuery.data && ordersQuery.data.items.length > 0 && (
        <>
          <div className={styles.list}>
            {ordersQuery.data.items.map((order) => (
              <OrderListRow key={order.id} order={order} />
            ))}
          </div>

          {ordersQuery.data.meta.totalPages > 1 && (
            <div className={styles.pagination}>
              <Button variant="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </Button>
              <span className={styles.pageIndicator}>
                Page {ordersQuery.data.meta.page} of {ordersQuery.data.meta.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= ordersQuery.data.meta.totalPages}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
