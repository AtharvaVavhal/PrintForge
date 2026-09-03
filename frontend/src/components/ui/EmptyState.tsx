import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import styles from './EmptyState.module.css'

interface EmptyStateProps {
  /** Optional decorative Lucide icon (rendered `aria-hidden`). */
  icon?: LucideIcon
  title: string
  /**
   * Heading level for the title. `'h1'` when this block IS the page's
   * primary heading (e.g. an empty cart); `'h2'` when it sits beneath an
   * existing page `<h1>` (e.g. an empty orders list under "Your orders").
   */
  titleAs?: 'h1' | 'h2'
  description?: ReactNode
  /** A single obvious call-to-action that already exists in the app
   * (e.g. a "Browse the shop" link) — never invented here. */
  action?: ReactNode
}

/**
 * The shared storefront "there is nothing here yet" state — a centred
 * icon + heading + supporting line + optional action. Replaces the three
 * near-identical `Empty*` blocks the cart / catalog / orders pages each
 * carried. This is the genuinely-empty case; a fetch failure stays an
 * `<Alert variant="error">` instead.
 */
export function EmptyState({
  icon: Icon,
  title,
  titleAs: TitleTag = 'h2',
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {Icon && <Icon size={40} strokeWidth={1.5} aria-hidden="true" />}
      <TitleTag className={styles.title}>{title}</TitleTag>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
