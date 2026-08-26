import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/utils/cn'
import { LogoutButton } from '@/features/auth/LogoutButton'
import styles from './Header.module.css'

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return cn(styles.navLink, isActive && styles.navLinkActive)
}

export function Header() {
  const { user, status } = useAuth()

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <NavLink to={ROUTES.HOME} className={styles.brand}>
          PrintForge
        </NavLink>

        <nav className={styles.nav} aria-label="Main">
          <NavLink to={ROUTES.HOME} end className={navLinkClassName}>
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
            </>
          )}
        </nav>

        <div className={styles.actions}>
          {status === 'authenticated' && user ? (
            <>
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
