import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import styles from './Breadcrumbs.module.css'

export interface Crumb {
  label: string
  /** Omit on the final (current) crumb. */
  to?: string
}

/**
 * Marketplace-style breadcrumb trail. Purely navigational — it reflects
 * where the user is, never invents a hierarchy. The last crumb is the
 * current page and is not a link.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className={styles.nav}>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className={styles.item}>
                {item.to && !isLast ? (
                  <Link to={item.to} className={styles.link}>
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className={styles.current}
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {item.label}
                  </span>
                )}
              </li>
              {!isLast && (
                <li className={styles.separator} aria-hidden="true">
                  <ChevronRight size={14} />
                </li>
              )}
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
