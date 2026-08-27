import { useParams } from 'react-router-dom'
import { useAdminCustomer } from '@/hooks/useAdminCustomer'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/utils/formatPrice'
import { AdminOrderRow } from '@/features/admin/AdminOrderRow'
import styles from './AdminCustomerDetailPage.module.css'

/** Behind AdminRoute (App.tsx). GET /admin/customers/:id — read-only, no
 * edit form anywhere on this page (the backend exposes no PATCH for
 * customer records, §19). */
export function AdminCustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: customer, isPending, isError, error } = useAdminCustomer(id!)

  if (isPending) {
    return (
      <section className={styles.wrap}>
        <h1>Customer</h1>
        <Skeleton className={styles.skeletonBlock} />
      </section>
    )
  }

  if (isError) {
    return (
      <section className={styles.wrap}>
        <h1>Customer</h1>
        <Alert variant="error">{getApiErrorMessage(error)}</Alert>
      </section>
    )
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <h1>{customer.email}</h1>
        {!customer.isActive && <span className={styles.inactiveFlag}>Inactive</span>}
      </div>

      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Orders</span>
          <span className={styles.statValue}>{customer.orderCount}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total spend</span>
          <span className={styles.statValue}>{formatPrice(customer.totalSpend)}</span>
        </div>
      </div>

      <div className={styles.summaryBlock}>
        <h2 className={styles.heading}>Address on file</h2>
        {customer.addressLine1 ? (
          <p className={styles.address}>
            {customer.addressLine1}
            {customer.addressLine2 && (
              <>
                <br />
                {customer.addressLine2}
              </>
            )}
            <br />
            {customer.city}, {customer.state} {customer.postalCode}
            <br />
            {customer.country}
            {customer.phone && (
              <>
                <br />
                {customer.phone}
              </>
            )}
          </p>
        ) : (
          <p className={styles.meta}>No address on file.</p>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionHeading}>Recent orders</h2>
        {customer.recentOrders.length === 0 ? (
          <p className={styles.meta}>No orders yet.</p>
        ) : (
          <div className={styles.list}>
            {customer.recentOrders.map((order) => (
              <AdminOrderRow key={order.id} order={order} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
