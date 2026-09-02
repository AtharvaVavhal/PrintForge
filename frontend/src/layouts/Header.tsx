import { NavLink, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { ShoppingCart, Menu, X, User } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCart } from '@/hooks/useCart'
import { useCategoryTree } from '@/hooks/useCategoryTree'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/utils/cn'
import { LogoutButton } from '@/features/auth/LogoutButton'
import { CurrencySelector } from '@/components/layout/CurrencySelector'
import { MegaMenuBar } from '@/components/layout/MegaMenu'
import { CategoryAccordion } from '@/components/layout/CategoryAccordion'
import { HeaderSearch } from './HeaderSearch'
import styles from './Header.module.css'

export function Header() {
  const { user, status } = useAuth()
  const { data: cart } = useCart()
  const { data: categoryTree, isLoading: treeLoading } = useCategoryTree()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // "Sign up" carries the current page as `state.from` so a customer who
  // registers from the storefront chrome returns to where they were, the
  // same way ProtectedRoute forwards it (UX-04). Skipped on the auth pages
  // themselves so registration can't resolve back to /login or /register.
  // "Log in" is unchanged.
  const onAuthPage =
    location.pathname === ROUTES.LOGIN || location.pathname === ROUTES.REGISTER
  const registerState = onAuthPage ? undefined : { from: location }

  const categories = categoryTree ?? []
  const isAuthenticated = status === 'authenticated' && Boolean(user)
  const cartCount = cart?.itemCount ?? 0

  return (
    <>
      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className={cn(styles.drawerOverlay, mobileOpen && styles.visible)}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <header className={styles.header}>
        {/* Top row */}
        <div className={styles.topRow}>
          <button
            className={styles.mobileMenuButton}
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            {mobileOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
          </button>

          <NavLink to={ROUTES.HOME} className={styles.brand} aria-label="PrintForge home">
            PrintForge
          </NavLink>

          <HeaderSearch variant="bar" />

          {/* Right side actions */}
          <div className={styles.actions}>
            <CurrencySelector />

            <NavLink to={ROUTES.CART} className={styles.cartLink} aria-label={`Cart${cartCount > 0 ? `, ${cartCount} item${cartCount === 1 ? '' : 's'}` : ''}`}>
              <ShoppingCart size={20} aria-hidden="true" />
              {cartCount > 0 && <span className={styles.cartBadge}>{cartCount}</span>}
            </NavLink>

            {isAuthenticated ? (
              <>
                {user?.role === 'ADMIN' && (
                  <NavLink to={ROUTES.ADMIN_DASHBOARD} className={styles.navLink}>
                    Admin
                  </NavLink>
                )}
                <NavLink to={ROUTES.ACCOUNT} className={styles.accountLink}>
                  <User size={18} aria-hidden="true" />
                  <span className={styles.accountLabel}>Account</span>
                </NavLink>
                <LogoutButton />
              </>
            ) : status === 'unauthenticated' ? (
              <>
                <NavLink to={ROUTES.LOGIN} className={styles.navLink}>
                  Log in
                </NavLink>
                <NavLink
                  to={ROUTES.REGISTER}
                  state={registerState}
                  className={styles.signUpLink}
                >
                  Sign up
                </NavLink>
              </>
            ) : null}
          </div>
        </div>

        {/* Bottom navigation row - Desktop category menu */}
        <nav className={styles.navRowDesktop} aria-label="Product categories">
          <div className={styles.navInnerDesktop}>
            {treeLoading ? (
              <div className={styles.navSkeleton} aria-busy="true" aria-label="Loading categories" />
            ) : (
              <MegaMenuBar categories={categories} />
            )}
          </div>
        </nav>

        {/* Mobile drawer navigation */}
        <nav
          id="mobile-nav"
          className={cn(styles.navRowMobile, mobileOpen && styles.open)}
          aria-label="Categories"
          role="navigation"
        >
          <div className={styles.navInnerMobile}>
            <div className={styles.mobileDrawerHead}>
              <span className={styles.mobileDrawerTitle}>Menu</span>
              <button
                className={styles.mobileNavClose}
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X size={24} aria-hidden="true" />
              </button>
            </div>

            <HeaderSearch variant="drawer" onSubmitted={() => setMobileOpen(false)} />

            <NavLink
              to={ROUTES.PRODUCTS}
              className={styles.mobileAllProducts}
              onClick={() => setMobileOpen(false)}
            >
              All products
            </NavLink>
            {treeLoading ? (
              <div className={styles.navSkeleton} aria-busy="true" aria-label="Loading categories" />
            ) : (
              <CategoryAccordion categories={categories} />
            )}

            <div className={styles.mobileDrawerAccount}>
              {isAuthenticated ? (
                <>
                  <NavLink
                    to={ROUTES.ACCOUNT}
                    className={styles.mobileAccountLink}
                    onClick={() => setMobileOpen(false)}
                  >
                    My account
                  </NavLink>
                  <NavLink
                    to={ROUTES.ORDERS}
                    className={styles.mobileAccountLink}
                    onClick={() => setMobileOpen(false)}
                  >
                    My orders
                  </NavLink>
                  {user?.role === 'ADMIN' && (
                    <NavLink
                      to={ROUTES.ADMIN_DASHBOARD}
                      className={styles.mobileAccountLink}
                      onClick={() => setMobileOpen(false)}
                    >
                      Admin
                    </NavLink>
                  )}
                </>
              ) : (
                <>
                  <NavLink
                    to={ROUTES.LOGIN}
                    className={styles.mobileAccountLink}
                    onClick={() => setMobileOpen(false)}
                  >
                    Log in
                  </NavLink>
                  <NavLink
                    to={ROUTES.REGISTER}
                    state={registerState}
                    className={styles.mobileAccountLink}
                    onClick={() => setMobileOpen(false)}
                  >
                    Create an account
                  </NavLink>
                </>
              )}
            </div>
          </div>
        </nav>
      </header>
    </>
  )
}
