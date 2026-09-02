import styles from './FullPageLoader.module.css'

/**
 * Full-viewport loading state for the brief window while the app is
 * establishing something the page cannot render without — currently the
 * auth-bootstrap refresh (ProtectedRoute). Replaces a bare `null` render
 * so a hard reload of a protected route never shows a blank white screen.
 */
export function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </div>
  )
}
