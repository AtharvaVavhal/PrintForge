import { Link, useSearchParams } from 'react-router-dom'
import { useAdminCustomers } from '@/hooks/useAdminCustomers'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import { AdminPage } from '@/components/admin/AdminPage'
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminTable } from '@/components/admin/AdminTable'
import { AdminBadge } from '@/components/admin/AdminBadge'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { AdminPageSkeleton } from '@/components/admin/AdminPageSkeleton'
import { adminCustomerDetailPath } from '@/constants/routes'
import { formatDate } from '@/utils/formatDate'
import styles from './AdminCustomersPage.module.css'

const DEFAULT_LIMIT = 20

/** Behind AdminRoute (App.tsx). GET /admin/customers is paginated the same
 * way GET /orders is — real page/limit params, no client-side slicing.
 * Read-only: no edit capability anywhere on this page or the detail page,
 * since the backend exposes none (§19: "customer list (read-only)"), and
 * there is no customer-search endpoint, so this stays a plain paginated
 * list with no filter/search controls. */
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

  if (customersQuery.isPending) {
    return <AdminPageSkeleton rows={4} />
  }

  const data = customersQuery.data

  return (
    <AdminPage title="Customers" description="Everyone who has registered an account, newest first.">
      {customersQuery.isError ? (
        <Alert variant="error">{getApiErrorMessage(customersQuery.error)}</Alert>
      ) : data && data.items.length === 0 ? (
        <AdminEmptyState
          title="No customers yet"
          description="Registered customer accounts will appear here."
        />
      ) : data ? (
        <div className={styles.results} aria-busy={customersQuery.isFetching || undefined}>
          <AdminCard flush>
            <AdminTable caption="Customers">
              <AdminTable.Head>
                <AdminTable.Row>
                  <AdminTable.HeaderCell>Customer</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell align="center">Orders</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell>Joined</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell>Status</AdminTable.HeaderCell>
                </AdminTable.Row>
              </AdminTable.Head>
              <AdminTable.Body>
                {data.items.map((customer) => (
                  <AdminTable.Row key={customer.id}>
                    <AdminTable.Cell>
                      <Link
                        to={adminCustomerDetailPath(customer.id)}
                        className={styles.customerLink}
                      >
                        {customer.email}
                      </Link>
                    </AdminTable.Cell>
                    <AdminTable.Cell align="center">
                      {customer.orderCount} {customer.orderCount === 1 ? 'order' : 'orders'}
                    </AdminTable.Cell>
                    <AdminTable.Cell>{formatDate(customer.createdAt)}</AdminTable.Cell>
                    <AdminTable.Cell>
                      {customer.isActive ? (
                        <AdminBadge variant="success">Active</AdminBadge>
                      ) : (
                        <AdminBadge variant="neutral">Inactive</AdminBadge>
                      )}
                    </AdminTable.Cell>
                  </AdminTable.Row>
                ))}
              </AdminTable.Body>
            </AdminTable>
          </AdminCard>

          <AdminPagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            onPageChange={goToPage}
            label="Customers pagination"
          />
        </div>
      ) : null}
    </AdminPage>
  )
}
