import { Button } from '@/components/ui/Button'
import styles from './AdminPagination.module.css'

interface AdminPaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  /** For the accessible label, e.g. "orders pagination". */
  label?: string
}

/**
 * Prev / page indicator / Next — the exact control every admin list page
 * currently hand-rolls, extracted verbatim in behaviour: same
 * one-based page numbers, same `onPageChange(nextPage)` callback, same
 * disabled edges, and it renders nothing when there is only one page.
 *
 * Wrapped in a <nav> landmark; the live indicator announces page changes
 * to screen readers.
 */
export function AdminPagination({
  page,
  totalPages,
  onPageChange,
  label = 'Pagination',
}: AdminPaginationProps) {
  if (totalPages <= 1) return null

  const atStart = page <= 1
  const atEnd = page >= totalPages

  return (
    <nav className={styles.wrap} aria-label={label}>
      <Button variant="secondary" disabled={atStart} onClick={() => onPageChange(page - 1)}>
        Previous
      </Button>

      <span className={styles.indicator} aria-current="page" aria-live="polite">
        Page {page} of {totalPages}
      </span>

      <Button variant="secondary" disabled={atEnd} onClick={() => onPageChange(page + 1)}>
        Next
      </Button>
    </nav>
  )
}
