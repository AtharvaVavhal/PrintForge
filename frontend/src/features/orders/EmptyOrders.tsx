import { Link } from 'react-router-dom'
import { PackageSearch } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

/** Distinct from the fetch-error state (OrdersPage renders an Alert for
 * that) — this is the genuinely-zero-orders case: a real designed state,
 * not a blank page. */
export function EmptyOrders() {
  return (
    <EmptyState
      icon={PackageSearch}
      title="No orders yet"
      description="Once you check out, your orders will show up here."
      action={
        <Link to={ROUTES.PRODUCTS}>
          <Button>Browse the shop</Button>
        </Link>
      }
    />
  )
}
