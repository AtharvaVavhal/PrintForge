import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { Seo } from '@/seo/Seo'
import styles from './ForbiddenPage.module.css'

/** Where AdminRoute sends a logged-in non-admin — see its doc comment for
 * why this is a distinct page rather than reusing the /login redirect. */
export function ForbiddenPage() {
  return (
    <section className={styles.wrap}>
      <Seo title="Not authorised" noindex />
      <h1>Not authorised</h1>
      <p>You don&rsquo;t have access to this page (error 403).</p>
      <Link to={ROUTES.HOME}>Back to home</Link>
    </section>
  )
}
