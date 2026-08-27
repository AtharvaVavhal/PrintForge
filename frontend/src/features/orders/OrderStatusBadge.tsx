import type { OrderStatus } from '@/types/orders'
import { ORDER_STATUS_LABELS, orderStatusTone } from './orderStatus'
import styles from './OrderStatusBadge.module.css'

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={styles.badge} data-tone={orderStatusTone(status)}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  )
}
