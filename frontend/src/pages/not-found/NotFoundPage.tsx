import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { Seo } from '@/seo/Seo'
import styles from './NotFoundPage.module.css'

export function NotFoundPage() {
  return (
    <section className={styles.wrap}>
      <Seo title="Page not found" noindex />
      <h1>Page not found</h1>
      <p>We couldn&apos;t find that page (error 404).</p>
      <Link to={ROUTES.HOME}>Back to home</Link>
    </section>
  )
}
