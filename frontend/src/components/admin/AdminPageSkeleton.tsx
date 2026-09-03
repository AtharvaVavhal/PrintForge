import { Skeleton } from '@/components/ui/Skeleton'
import styles from './AdminPageSkeleton.module.css'

interface AdminPageSkeletonProps {
  /** Number of body placeholder blocks. */
  rows?: number
}

/**
 * A page-level loading placeholder shaped like `AdminPage` — a title bar
 * plus a few content blocks. It intentionally knows nothing about a
 * specific page's data (no fake table columns / stat labels); pages that
 * need a more literal skeleton keep their own.
 */
export function AdminPageSkeleton({ rows = 3 }: AdminPageSkeletonProps) {
  return (
    <div className={styles.page} role="status">
      <span className="srOnly">Loading</span>
      <div className={styles.header}>
        <Skeleton className={styles.title} />
        <Skeleton className={styles.action} />
      </div>
      <div className={styles.content}>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className={styles.block} />
        ))}
      </div>
    </div>
  )
}
