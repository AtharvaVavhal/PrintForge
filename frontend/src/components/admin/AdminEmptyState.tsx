import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import styles from './AdminEmptyState.module.css'

interface AdminEmptyStateProps {
  title: string
  description?: ReactNode
  /** A single call-to-action (e.g. a "New product" button/link). */
  action?: ReactNode
  /** Optional decorative Lucide icon. */
  icon?: LucideIcon
}

/**
 * The designed "there is nothing here yet" state — a replacement for the
 * bare `<p>No X yet.</p>` scattered across admin list pages. This is the
 * genuinely-empty case, distinct from a fetch error (which stays an
 * Alert). Pages are migrated onto it in a later step.
 */
export function AdminEmptyState({ title, description, action, icon: Icon }: AdminEmptyStateProps) {
  return (
    <div className={styles.wrap}>
      {Icon && <Icon size={32} strokeWidth={1.5} aria-hidden="true" className={styles.icon} />}
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
