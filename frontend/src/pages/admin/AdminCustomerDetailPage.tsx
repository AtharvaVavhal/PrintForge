import { Link, useParams } from 'react-router-dom'
import { useAdminCustomer } from '@/hooks/useAdminCustomer'
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
import styles from './AdminCustomerDetailPage.module.css'

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <AdminBadge variant="success">Active</AdminBadge>
  ) : (
    <AdminBadge variant="neutral">Inactive</AdminBadge>
  )
}

/**
 * Behind AdminRoute (App.tsx). GET /admin/customers/:id — read-only. The
 * backend exposes no PATCH for customer records (§19), so there is no
 * edit form or lifecycle action anywhere on this page. `recentOrders` is
 * a fixed slice (the 5 newest, server-side) with no pagination meta, so
 * there is no AdminPagination here — "View all orders" links through to
 * the orders list filtered by this customer instead.
 */
export function AdminCustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: customer, isPending, isError, error } = useAdminCustomer(id!)

  if (isPending) {
    return <AdminPageSkeleton rows={4} />
  }

  if (isError) {
    return (
      <AdminPage
        title="Customer"
        breadcrumbs={[{ label: 'Customers', to: ROUTES.ADMIN_CUSTOMERS }, { label: 'Customer' }]}
      >
        <Alert variant="error">{getApiErrorMessage(error)}</Alert>
      </AdminPage>
    )
  }

  const hasAddress = Boolean(customer.addressLine1)
  const cityLine = [customer.city, customer.state, customer.postalCode].filter(Boolean).join(', ')

  return (
    <AdminPage
      breadcrumbs={[
        { label: 'Customers', to: ROUTES.ADMIN_CUSTOMERS },
        { label: customer.email },
      ]}
      title={customer.email}
      description={`Joined ${formatDate(customer.createdAt)}`}
      actions={<StatusBadge isActive={customer.isActive} />}
    >
      <div className={styles.statGrid}>
        <AdminCard as="section" title="Orders">
          <p className={styles.statValue}>{customer.orderCount}</p>
        </AdminCard>
        <AdminCard as="section" title="Total spend">
          <p className={styles.statValue}>{formatPrice(customer.totalSpend)}</p>
        </AdminCard>
      </div>

      <AdminCard as="section" title="Customer information">
        <dl className={styles.info}>
          <div className={styles.infoRow}>
            <dt>Email</dt>
            <dd>{customer.email}</dd>
          </div>
          <div className={styles.infoRow}>
            <dt>Phone</dt>
            <dd>{customer.phone ?? '—'}</dd>
          </div>
          <div className={styles.infoRow}>
            <dt>Joined</dt>
            <dd>{formatDate(customer.createdAt)}</dd>
          </div>
          <div className={styles.infoRow}>
            <dt>Account status</dt>
            <dd>
              <StatusBadge isActive={customer.isActive} />
            </dd>
          </div>
          <div className={styles.infoRow}>
            <dt>Address</dt>
            <dd>
              {hasAddress ? (
                <address className={styles.address}>
                  <span>{customer.addressLine1}</span>
                  {customer.addressLine2 && <span>{customer.addressLine2}</span>}
                  {cityLine && <span>{cityLine}</span>}
                  {customer.country && <span>{customer.country}</span>}
                </address>
              ) : (
                <span className={styles.muted}>No address on file.</span>
              )}
            </dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard
        as="section"
        flush
        title="Recent orders"
        actions={
          <Link to={`${ROUTES.ADMIN_ORDERS}?userId=${customer.id}`} className={styles.headerLink}>
            View all orders
          </Link>
        }
      >
        {customer.recentOrders.length === 0 ? (
          <div className={styles.emptyPad}>
            <AdminEmptyState
              title="No orders yet"
              description="This customer has not placed any orders."
            />
          </div>
        ) : (
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
              {customer.recentOrders.map((order) => (
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
        )}
      </AdminCard>
    </AdminPage>
  )
}
