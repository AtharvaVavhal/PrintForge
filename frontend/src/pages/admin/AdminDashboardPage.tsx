import { Link } from 'react-router-dom'
import { useAdminDashboard } from '@/hooks/useAdminDashboard'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import { AdminPage } from '@/components/admin/AdminPage'
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminTable } from '@/components/admin/AdminTable'
import { AdminBadge } from '@/components/admin/AdminBadge'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { AdminPageSkeleton } from '@/components/admin/AdminPageSkeleton'
import { OrderStatusBadge } from '@/features/orders/OrderStatusBadge'
import { formatPrice } from '@/utils/formatPrice'
import { formatDate } from '@/utils/formatDate'
import { adminOrderDetailPath, ROUTES } from '@/constants/routes'
import styles from './AdminDashboardPage.module.css'

/**
 * Behind AdminRoute (App.tsx). Minimal by design — GET /admin/dashboard is
 * framed by the backend as "minimal — no charts" (§19): all-time order
 * count, per-status breakdown, paid-or-later revenue, and the ten most
 * recent orders. This page is a faithful thin view of exactly those four
 * fields — no client-side calculation, no time-series, no extra fetches.
 */
export function AdminDashboardPage() {
  const { data, isPending, isError, error } = useAdminDashboard()

  if (isPending) {
    return <AdminPageSkeleton rows={4} />
  }

  const viewAllOrders = (
    <Link to={ROUTES.ADMIN_ORDERS} className={styles.link}>
      View all orders
    </Link>
  )

  return (
    <AdminPage
      title="Overview"
      description="All-time order and revenue totals, plus the ten most recent orders."
    >
      {isError ? (
        <Alert variant="error">{getApiErrorMessage(error)}</Alert>
      ) : data ? (
        <>
          <div className={styles.statGrid}>
            <AdminCard as="section" title="Total orders">
              <p className={styles.statValue}>{data.totalOrders}</p>
            </AdminCard>
            <AdminCard as="section" title="Revenue (paid or later)">
              <p className={styles.statValue}>{formatPrice(data.totalRevenue)}</p>
            </AdminCard>
          </div>

          <AdminCard as="section" title="Orders by status">
            <dl className={styles.statusGrid}>
              {data.ordersByStatus.map((row) => (
                <div key={row.status} className={styles.statusItem}>
                  <dt className={styles.statusTerm}>
                    <OrderStatusBadge status={row.status} />
                  </dt>
                  <dd className={styles.statusCount}>{row.count}</dd>
                </div>
              ))}
            </dl>
          </AdminCard>

          {data.recentOrders.length === 0 ? (
            <AdminCard as="section" title="Recent orders" actions={viewAllOrders}>
              <AdminEmptyState
                title="No orders yet"
                description="Recent orders will appear here as customers place them."
              />
            </AdminCard>
          ) : (
            <AdminCard as="section" flush title="Recent orders" actions={viewAllOrders}>
              <AdminTable caption="Recent orders">
                <AdminTable.Head>
                  <AdminTable.Row>
                    <AdminTable.HeaderCell>Order</AdminTable.HeaderCell>
                    <AdminTable.HeaderCell>Date</AdminTable.HeaderCell>
                    <AdminTable.HeaderCell align="center">Items</AdminTable.HeaderCell>
                    <AdminTable.HeaderCell>Status</AdminTable.HeaderCell>
                    <AdminTable.HeaderCell align="end">Total</AdminTable.HeaderCell>
                  </AdminTable.Row>
                </AdminTable.Head>
                <AdminTable.Body>
                  {data.recentOrders.map((order) => (
                    <AdminTable.Row key={order.id}>
                      <AdminTable.Cell>
                        <Link to={adminOrderDetailPath(order.id)} className={styles.orderLink}>
                          {order.orderNumber}
                        </Link>
                      </AdminTable.Cell>
                      <AdminTable.Cell>{formatDate(order.createdAt)}</AdminTable.Cell>
                      <AdminTable.Cell align="center">{order.itemCount}</AdminTable.Cell>
                      <AdminTable.Cell>
                        <span className={styles.statusCell}>
                          <OrderStatusBadge status={order.status} />
                          {order.needsManualRefund && (
                            <AdminBadge variant="warning">Refund pending</AdminBadge>
                          )}
                        </span>
                      </AdminTable.Cell>
                      <AdminTable.Cell align="end">{formatPrice(order.total)}</AdminTable.Cell>
                    </AdminTable.Row>
                  ))}
                </AdminTable.Body>
              </AdminTable>
            </AdminCard>
          )}
        </>
      ) : null}
    </AdminPage>
  )
}
