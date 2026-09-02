import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { OrderListItemView } from '@/types/orders'
import { orderDetailPath } from '@/constants/routes'
import { formatPrice } from '@/utils/formatPrice'
import { formatDate } from '@/utils/formatDate'
import { OrderStatusBadge } from './OrderStatusBadge'
import styles from './OrderListRow.module.css'

interface OrderListRowProps {
  order: OrderListItemView
}

/** Links into the existing OrderDetailPage (/orders/:id) — that page owns
 * every bit of payment-retry and polling behavior; this row is a plain
 * navigation link, nothing more. */
export function OrderListRow({ order }: OrderListRowProps) {
  return (
    <Link to={orderDetailPath(order.id)} className={styles.row}>
      <div className={styles.primary}>
        <span className={styles.orderNumber}>{order.orderNumber}</span>
        <span className={styles.date}>{formatDate(order.createdAt)}</span>
      </div>
      <OrderStatusBadge status={order.status} />
      <span className={styles.itemCount}>
        {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
      </span>
      <span className={styles.total}>{formatPrice(order.total)}</span>
      <ChevronRight size={18} aria-hidden="true" className={styles.chevron} />
    </Link>
  )
}
