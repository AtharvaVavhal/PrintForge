import type { ReactNode } from 'react'
import { Breadcrumbs, type Crumb } from '@/components/ui/Breadcrumbs'
import styles from './AdminPage.module.css'

interface AdminPageProps {
  /** Rendered as the page's single <h1>. */
  title: string
  /** Short supporting line under the title. */
  description?: ReactNode
  /** Right-aligned header controls (buttons, links, filters). */
  actions?: ReactNode
  /** Optional trail — reuses the storefront Breadcrumbs primitive. */
  breadcrumbs?: Crumb[]
  children: ReactNode
}

/**
 * The consistent content structure for every admin page: an optional
 * breadcrumb, a header (title / description / actions), then the page body.
 *
 * It deliberately does NOT set its own max-width / centering / horizontal
 * padding — `AdminLayout` already provides the centred content container.
 * It carries no page-specific business logic; admin pages compose it.
 */
export function AdminPage({ title, description, actions, breadcrumbs, children }: AdminPageProps) {
  return (
    <div className={styles.page}>
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}

      <header className={styles.header}>
        <div className={styles.headingBlock}>
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>

      <div className={styles.content}>{children}</div>
    </div>
  )
}
