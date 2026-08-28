import { NavLink, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Search, ShoppingCart } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCart } from '@/hooks/useCart'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/utils/cn'
import {
  EMPTY_HEADER_SEARCH_VALUES,
  headerSearchSchema,
  type HeaderSearchFormValues,
} from '@/schemas/search.schema'
import { LogoutButton } from '@/features/auth/LogoutButton'
import styles from './Header.module.css'

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return cn(styles.navLink, isActive && styles.navLinkActive)
}

export function Header() {
  const { user, status } = useAuth()
  const { data: cart } = useCart()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<HeaderSearchFormValues>({
    resolver: zodResolver(headerSearchSchema),
    defaultValues: EMPTY_HEADER_SEARCH_VALUES,
  })

  /** Navigates to a fresh `?search=` query rather than merging into the
   * current search params — this deliberately drops any existing
   * `categoryId` so a header search always starts from "all categories"
   * instead of silently combining with whatever category filter happened
   * to be active on the page the user searched from. The category pills
   * on ProductListPage (CategoryFilter) can still be applied on top of an
   * active search afterwards — the backend ANDs categoryId+search together
   * when both are present. */
  function handleSearch(values: HeaderSearchFormValues) {
    reset(EMPTY_HEADER_SEARCH_VALUES)
    void navigate(`${ROUTES.PRODUCTS}?search=${encodeURIComponent(values.query)}`)
  }

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

        <form
          className={styles.searchForm}
          role="search"
          onSubmit={(e) => void handleSubmit(handleSearch)(e)}
          noValidate
        >
          <label htmlFor="header-search" className={styles.searchLabel}>
            Search products
          </label>
          <input
            id="header-search"
            type="search"
            placeholder="Search products…"
            className={styles.searchInput}
            aria-invalid={Boolean(errors.query)}
            {...register('query')}
          />
          <button type="submit" className={styles.searchSubmit} aria-label="Search">
            <Search size={18} aria-hidden="true" />
          </button>
          {errors.query && (
            <p className={styles.searchError} role="alert">
              {errors.query.message}
            </p>
          )}
        </form>

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
