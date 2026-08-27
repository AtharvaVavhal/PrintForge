import { useSearchParams } from 'react-router-dom'
import { useAdminCustomers } from '@/hooks/useAdminCustomers'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { AdminCustomerRow } from '@/features/admin/AdminCustomerRow'
import styles from './AdminCustomersPage.module.css'

const DEFAULT_LIMIT = 20

/** Behind AdminRoute (App.tsx). GET /admin/customers is paginated the same
 * way GET /orders is — real page/limit params. Read-only: no edit
 * capability anywhere on this page or the detail page, since the backend
 * exposes none (§19: "customer list (read-only)"). */
export function AdminCustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Number(searchParams.get('page') ?? '1')

  const customersQuery = useAdminCustomers({ page, limit: DEFAULT_LIMIT })

  function goToPage(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('page', String(nextPage))
      return next
    })
  }

  return (
    <section className={styles.wrap}>
      <h1>Customers</h1>

      {customersQuery.isPending && (
        <div className={styles.list} aria-hidden="true">
          <Skeleton className={styles.skeletonRow} />
          <Skeleton className={styles.skeletonRow} />
          <Skeleton className={styles.skeletonRow} />
        </div>
      )}

      {customersQuery.isError && <Alert variant="error">{getApiErrorMessage(customersQuery.error)}</Alert>}

      {customersQuery.data && customersQuery.data.items.length === 0 && (
        <p className={styles.empty}>No customers yet.</p>
      )}

      {customersQuery.data && customersQuery.data.items.length > 0 && (
        <>
          <div className={styles.list}>
            {customersQuery.data.items.map((customer) => (
              <AdminCustomerRow key={customer.id} customer={customer} />
            ))}
          </div>

          {customersQuery.data.meta.totalPages > 1 && (
            <div className={styles.pagination}>
              <Button variant="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </Button>
              <span className={styles.pageIndicator}>
                Page {customersQuery.data.meta.page} of {customersQuery.data.meta.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= customersQuery.data.meta.totalPages}
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
