import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/Button'
import styles from './HomePage.module.css'

export function HomePage() {
  const { status, user } = useAuth()

  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Custom prints, made to order.</h1>
        <p className={styles.subtitle}>
          {status === 'authenticated' && user
            ? `Welcome back, ${user.email}. Browse the catalog to get started.`
            : 'Create an account, browse the catalog, and order custom prints.'}
        </p>

        <div className={styles.actions}>
          <Link to={ROUTES.PRODUCTS}>
            <Button>Browse the shop</Button>
          </Link>
          {status === 'unauthenticated' && (
            <>
              <Link to={ROUTES.REGISTER}>
                <Button variant="secondary">Create an account</Button>
              </Link>
              <Link to={ROUTES.LOGIN}>
                <Button variant="ghost">Log in</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
