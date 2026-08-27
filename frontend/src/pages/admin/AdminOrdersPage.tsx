import { useSearchParams } from 'react-router-dom'
import { useAdminOrders } from '@/hooks/useAdminOrders'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { AdminOrderRow } from '@/features/admin/AdminOrderRow'
import { OrderListSkeleton } from '@/features/orders/OrderListSkeleton'
import styles from './AdminOrdersPage.module.css'

const DEFAULT_LIMIT = 20

/** Behind AdminRoute (App.tsx). GET /admin/orders is paginated the same
 * way GET /orders is (confirmed live) — real page/limit params, no
 * client-side slicing, same pagination UI as the customer-facing
 * OrdersPage. Unscoped by customer (unlike /orders, this is every order
 * in the system), newest-first. */
export function AdminOrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Number(searchParams.get('page') ?? '1')

  const ordersQuery = useAdminOrders({ page, limit: DEFAULT_LIMIT })

  function goToPage(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('page', String(nextPage))
      return next
    })
  }

  return (
    <section className={styles.wrap}>
      <h1>Orders</h1>

      {ordersQuery.isPending && <OrderListSkeleton />}

      {ordersQuery.isError && <Alert variant="error">{getApiErrorMessage(ordersQuery.error)}</Alert>}

      {ordersQuery.data && ordersQuery.data.items.length === 0 && <p className={styles.empty}>No orders yet.</p>}

      {ordersQuery.data && ordersQuery.data.items.length > 0 && (
        <>
          <div className={styles.list}>
            {ordersQuery.data.items.map((order) => (
              <AdminOrderRow key={order.id} order={order} />
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
