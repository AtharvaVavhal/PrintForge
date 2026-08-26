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
            ? `Welcome back, ${user.email}. The catalog is on its way — check back soon.`
            : 'PrintForge is getting ready. Create an account now so you\'re set to order the moment the catalog opens.'}
        </p>

        {status === 'unauthenticated' && (
          <div className={styles.actions}>
            <Link to={ROUTES.REGISTER}>
              <Button>Create an account</Button>
            </Link>
            <Link to={ROUTES.LOGIN}>
              <Button variant="secondary">Log in</Button>
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
