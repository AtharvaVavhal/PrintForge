import { Link } from 'react-router-dom'
import { PackageSearch } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/Button'
import styles from './EmptyOrders.module.css'

/** Distinct from the fetch-error state (OrdersPage renders an Alert for
 * that) — this is the genuinely-zero-orders case: a real designed state,
 * not a blank page. */
export function EmptyOrders() {
  return (
    <div className={styles.empty}>
      <PackageSearch size={40} strokeWidth={1.5} aria-hidden="true" />
      <h2>No orders yet</h2>
      <p>Once you check out, your orders will show up here.</p>
      <Link to={ROUTES.PRODUCTS}>
        <Button>Browse the shop</Button>
      </Link>
    </div>
  )
}
