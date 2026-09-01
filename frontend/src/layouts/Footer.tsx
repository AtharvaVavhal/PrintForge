import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import styles from './Footer.module.css'

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <nav className={styles.links} aria-label="Footer navigation">
          <Link to={ROUTES.ABOUT}>About</Link>
          <Link to={ROUTES.CONTACT}>Contact</Link>
          <Link to={ROUTES.PRIVACY}>Privacy</Link>
          <Link to={ROUTES.TERMS}>Terms</Link>
          <Link to={ROUTES.REFUND_POLICY}>Refund Policy</Link>
        </nav>
        <p className={styles.copyright}>
          &copy; {new Date().getFullYear()} PrintForge. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
