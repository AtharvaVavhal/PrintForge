import { Link } from 'react-router-dom'
import type { AdminCustomerListItemView } from '@/types/admin'
import { adminCustomerDetailPath } from '@/constants/routes'
import { formatDate } from '@/utils/formatDate'
import styles from './AdminCustomerRow.module.css'

interface AdminCustomerRowProps {
  customer: AdminCustomerListItemView
}

export function AdminCustomerRow({ customer }: AdminCustomerRowProps) {
  return (
    <Link to={adminCustomerDetailPath(customer.id)} className={styles.row}>
      <div className={styles.primary}>
        <span className={styles.email}>{customer.email}</span>
        <span className={styles.date}>Joined {formatDate(customer.createdAt)}</span>
      </div>
      {!customer.isActive && <span className={styles.inactiveFlag}>Inactive</span>}
      <span className={styles.orderCount}>
        {customer.orderCount} {customer.orderCount === 1 ? 'order' : 'orders'}
      </span>
    </Link>
  )
}
