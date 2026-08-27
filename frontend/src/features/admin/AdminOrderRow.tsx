import { Link } from 'react-router-dom'
import type { OrderListItemView } from '@/types/orders'
import { adminOrderDetailPath } from '@/constants/routes'
import { formatPrice } from '@/utils/formatPrice'
import { formatDate } from '@/utils/formatDate'
import { OrderStatusBadge } from '@/features/orders/OrderStatusBadge'
import styles from './AdminOrderRow.module.css'

interface AdminOrderRowProps {
  order: OrderListItemView
}

/**
 * Links into AdminOrderDetailPage (/admin/orders/:id) — a plain
 * navigation row, no status-change control here (that lives on the
 * detail page). Surfaces `needsManualRefund` — a field the customer-facing
 * OrderListRow deliberately never shows the customer, but that's exactly
 * the signal an admin needs to spot from a list.
 */
export function AdminOrderRow({ order }: AdminOrderRowProps) {
  return (
    <Link to={adminOrderDetailPath(order.id)} className={styles.row}>
      <div className={styles.primary}>
        <span className={styles.orderNumber}>{order.orderNumber}</span>
        <span className={styles.date}>{formatDate(order.createdAt)}</span>
      </div>
      <OrderStatusBadge status={order.status} />
      {order.needsManualRefund && <span className={styles.refundFlag}>Refund pending</span>}
      <span className={styles.itemCount}>
        {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
      </span>
      <span className={styles.total}>{formatPrice(order.total)}</span>
    </Link>
  )
}
