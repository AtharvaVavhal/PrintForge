import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Alert } from './Alert'
import styles from './ErrorState.module.css'

interface ErrorStateProps {
  /** Optional decorative Lucide icon (rendered `aria-hidden`). */
  icon?: LucideIcon
  title: string
  /**
   * Heading level for the title. Defaults to `'h1'` — the storefront's
   * page-level fetch-error branches all render the error as the page's
   * primary heading. Use `'h2'` when it sits beneath an existing page
   * `<h1>`.
   */
  titleAs?: 'h1' | 'h2'
  /**
   * The error detail — normally `getApiErrorMessage(error)`. Rendered
   * inside `<Alert variant="error">` so it keeps its assertive
   * `role="alert"` announcement and error styling, exactly as before.
   */
  message: ReactNode
  /**
   * A recovery link or button that already exists on the page (e.g. a
   * "← All orders" link) — never a retry the page didn't already have.
   */
  action?: ReactNode
}

/**
 * The shared storefront page-level error state — a heading, the error
 * message (in an `<Alert variant="error">`), and an optional recovery
 * action. The error-branch counterpart to `EmptyState`; kept as its own
 * component because the two carry different semantics (a fetch failure is
 * announced assertively, an empty collection is not).
 *
 * Section-level errors that sit *inside* a page which keeps its own
 * `<h1>` and chrome (Orders / Product list / Account) stay a bare
 * `<Alert>` — they are structurally different and adding a heading would
 * duplicate the page title.
 */
export function ErrorState({
  icon: Icon,
  title,
  titleAs: TitleTag = 'h1',
  message,
  action,
}: ErrorStateProps) {
  return (
    <div className={styles.error}>
      {Icon && <Icon size={40} strokeWidth={1.5} aria-hidden="true" />}
      <TitleTag className={styles.title}>{title}</TitleTag>
      <Alert variant="error">{message}</Alert>
      {action}
    </div>
  )
}
