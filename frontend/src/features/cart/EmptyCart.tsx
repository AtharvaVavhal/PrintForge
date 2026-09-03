import { Link } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

export function EmptyCart() {
  return (
    <EmptyState
      icon={ShoppingCart}
      title="Your cart is empty"
      titleAs="h1"
      description="Browse the shop to find something to customize."
      action={
        <Link to={ROUTES.PRODUCTS}>
          <Button>Browse the shop</Button>
        </Link>
      }
    />
  )
}
