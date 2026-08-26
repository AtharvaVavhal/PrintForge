import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import styles from './NotFoundPage.module.css'

export function NotFoundPage() {
  return (
    <section className={styles.wrap}>
      <h1>404</h1>
      <p>We couldn&apos;t find that page.</p>
      <Link to={ROUTES.HOME}>Back to home</Link>
    </section>
  )
}
