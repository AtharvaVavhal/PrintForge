import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Search, ShoppingCart, Menu, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCart } from '@/hooks/useCart'
import { useCategoryTree } from '@/hooks/useCategoryTree'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/utils/cn'
import {
  EMPTY_HEADER_SEARCH_VALUES,
  headerSearchSchema,
  type HeaderSearchFormValues,
} from '@/schemas/search.schema'
import { LogoutButton } from '@/features/auth/LogoutButton'
import { CurrencySelector } from '@/components/layout/CurrencySelector'
import { MegaMenuBar } from '@/components/layout/MegaMenu'
import { CategoryAccordion } from '@/components/layout/CategoryAccordion'
import styles from './Header.module.css'

export function Header() {
  const { user, status } = useAuth()
  const { data: cart } = useCart()
  const { data: categoryTree, isLoading: treeLoading } = useCategoryTree()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<HeaderSearchFormValues>({
    resolver: zodResolver(headerSearchSchema),
    defaultValues: EMPTY_HEADER_SEARCH_VALUES,
  })

  function handleSearch(values: HeaderSearchFormValues) {
    reset(EMPTY_HEADER_SEARCH_VALUES)
    void navigate(`${ROUTES.PRODUCTS}?search=${encodeURIComponent(values.query)}`)
  }

  const categories = categoryTree ?? []

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
          {/* Mobile menu button */}
          <button
            className={styles.mobileMenuButton}
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            {mobileOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
          </button>

          {/* Search form (desktop) */}
          <form
            className={styles.searchForm}
            role="search"
            onSubmit={(e) => void handleSubmit(handleSearch)(e)}
            noValidate
          >
            <label htmlFor="header-search" className={styles.searchLabel}>
              Search products
            </label>
            <Search size={18} className={styles.searchIcon} aria-hidden="true" />
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

          {/* Brand */}
          <NavLink to={ROUTES.HOME} className={styles.brand} aria-label="PrintForge home">
            PrintForge
          </NavLink>

          {/* Right side actions */}
          <div className={styles.actions}>
            {status === 'authenticated' && user ? (
              <>
                <CurrencySelector />
                <NavLink to={ROUTES.CART} className={styles.cartLink} aria-label="Cart">
                  <ShoppingCart size={20} aria-hidden="true" />
                  {cart && cart.itemCount > 0 && (
                    <span className={styles.cartBadge}>{cart.itemCount}</span>
                  )}
                </NavLink>
                {user.role === 'ADMIN' && (
                  <>
                    <NavLink to={ROUTES.ADMIN_DASHBOARD} className={styles.navLink}>
                      Admin
                    </NavLink>
                    <NavLink to={ROUTES.ADMIN_PRODUCTS} className={styles.navLink}>
                      Products
                    </NavLink>
                    <NavLink to={ROUTES.ADMIN_CATEGORIES} className={styles.navLink}>
                      Categories
                    </NavLink>
                    <NavLink to={ROUTES.ADMIN_COUPONS} className={styles.navLink}>
                      Coupons
                    </NavLink>
                    <NavLink to={ROUTES.ADMIN_SETTINGS} className={styles.navLink}>
                      Settings
                    </NavLink>
                  </>
                )}
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

        {/* Bottom navigation row - Desktop MegaMenu */}
        <nav className={styles.navRowDesktop} aria-label="Categories">
          <div className={styles.navInnerDesktop}>
            {!treeLoading && (
              <MegaMenuBar categories={categories} />
            )}
            {treeLoading && (
              <div className={styles.navSkeleton} aria-busy="true" aria-label="Loading categories" />
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
            <button
              className={styles.mobileNavClose}
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X size={24} aria-hidden="true" />
            </button>
            {!treeLoading && (
              <CategoryAccordion categories={categories} />
            )}
            {treeLoading && (
              <div className={styles.navSkeleton} aria-busy="true" aria-label="Loading categories" />
            )}
          </div>
        </nav>
      </header>
    </>
  )
}
