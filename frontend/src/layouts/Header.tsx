import { NavLink } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCart } from '@/hooks/useCart'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/utils/cn'
import { LogoutButton } from '@/features/auth/LogoutButton'
import styles from './Header.module.css'

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return cn(styles.navLink, isActive && styles.navLinkActive)
}

export function Header() {
  const { user, status } = useAuth()
  const { data: cart } = useCart()

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <NavLink to={ROUTES.HOME} className={styles.brand}>
          PrintForge
        </NavLink>

        <nav className={styles.nav} aria-label="Main">
          <NavLink to={ROUTES.PRODUCTS} className={navLinkClassName}>
            Shop
          </NavLink>
          {status === 'authenticated' && (
            <>
              <NavLink to={ROUTES.ORDERS} className={navLinkClassName}>
                Orders
              </NavLink>
              <NavLink to={ROUTES.ACCOUNT} className={navLinkClassName}>
                Account
              </NavLink>
              {user?.role === 'ADMIN' && (
                <>
                  <NavLink to={ROUTES.ADMIN_DASHBOARD} className={navLinkClassName}>
                    Admin
                  </NavLink>
                  <NavLink to={ROUTES.ADMIN_PRODUCTS} className={navLinkClassName}>
                    Products
                  </NavLink>
                  <NavLink to={ROUTES.ADMIN_CATEGORIES} className={navLinkClassName}>
                    Categories
                  </NavLink>
                  <NavLink to={ROUTES.ADMIN_COUPONS} className={navLinkClassName}>
                    Coupons
                  </NavLink>
                </>
              )}
            </>
          )}
        </nav>

        <div className={styles.actions}>
          {status === 'authenticated' && user ? (
            <>
              <NavLink to={ROUTES.CART} className={styles.cartLink} aria-label="Cart">
                <ShoppingCart size={20} aria-hidden="true" />
                {cart && cart.itemCount > 0 && (
                  <span className={styles.cartBadge}>{cart.itemCount}</span>
                )}
              </NavLink>
              <span className={styles.userEmail}>{user.email}</span>
              <LogoutButton />
            </>
          ) : status === 'unauthenticated' ? (
            <>
              <NavLink to={ROUTES.LOGIN} className={styles.navLink}>
                Log in
              </NavLink>
              <NavLink to={ROUTES.REGISTER} className={styles.signUpLink}>
                Sign up
              </NavLink>
            </>
          ) : null}
        </div>
      </div>
    </header>
  )
}
