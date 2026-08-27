import { Link } from 'react-router-dom'
import { useAdminDashboard } from '@/hooks/useAdminDashboard'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/utils/formatPrice'
import { OrderStatusBadge } from '@/features/orders/OrderStatusBadge'
import { AdminOrderRow } from '@/features/admin/AdminOrderRow'
import { ROUTES } from '@/constants/routes'
import styles from './AdminDashboardPage.module.css'

/** Behind AdminRoute (App.tsx). Minimal by design — order count, per-status
 * breakdown, revenue, recent orders — no charts (§19: "minimal — no
 * charts" is the backend's own framing for GET /admin/dashboard, matched
 * here rather than building visuals the data was never shaped for). */
export function AdminDashboardPage() {
  const { data, isPending, isError, error } = useAdminDashboard()

  return (
    <section className={styles.wrap}>
      <h1>Admin dashboard</h1>

      {isPending && (
        <div className={styles.statGrid} aria-hidden="true">
          <Skeleton className={styles.statCard} />
          <Skeleton className={styles.statCard} />
          <Skeleton className={styles.statCard} />
        </div>
      )}

      {isError && <Alert variant="error">{getApiErrorMessage(error)}</Alert>}

      {data && (
        <>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Total orders</span>
              <span className={styles.statValue}>{data.totalOrders}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Revenue (paid-or-later)</span>
              <span className={styles.statValue}>{formatPrice(data.totalRevenue)}</span>
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionHeading}>Orders by status</h2>
            <ul className={styles.statusList}>
              {data.ordersByStatus.map((row) => (
                <li key={row.status} className={styles.statusRow}>
                  <OrderStatusBadge status={row.status} />
                  <span className={styles.statusCount}>{row.count}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionHeading}>Recent orders</h2>
              <Link to={ROUTES.ADMIN_ORDERS}>View all orders</Link>
            </div>

            {data.recentOrders.length === 0 ? (
              <p className={styles.empty}>No orders yet.</p>
            ) : (
              <div className={styles.list}>
                {data.recentOrders.map((order) => (
                  <AdminOrderRow key={order.id} order={order} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
