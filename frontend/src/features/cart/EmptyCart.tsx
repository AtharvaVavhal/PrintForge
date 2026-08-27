import { Link } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/Button'
import styles from './EmptyCart.module.css'

export function EmptyCart() {
  return (
    <div className={styles.empty}>
      <ShoppingCart size={40} strokeWidth={1.5} aria-hidden="true" />
      <h2>Your cart is empty</h2>
      <p>Browse the shop to find something to customize.</p>
      <Link to={ROUTES.PRODUCTS}>
        <Button>Browse the shop</Button>
      </Link>
    </div>
  )
}
