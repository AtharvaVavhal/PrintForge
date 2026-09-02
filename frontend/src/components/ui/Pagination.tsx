import { Button } from './Button'
import styles from './Pagination.module.css'

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  /** Accessible name for the <nav> landmark, e.g. "products pagination". */
  label?: string
  /**
   * After a page change, scroll the viewport back to the top so the reader
   * starts at the beginning of the new page's results rather than staying
   * at the bottom of the previous one (UX-37). On by default; pass an
   * element to scroll that into view instead of the window.
   */
  scrollToTop?: boolean
  scrollTargetRef?: React.RefObject<HTMLElement | null>
}

/**
 * The one storefront pager — Previous / "Page X of Y" / Next — replacing
 * the identical hand-rolled block in the product listing, orders list and
 * review list. Same one-based page numbers, same `onPageChange(nextPage)`
 * contract, same disabled edges, and it renders nothing when there is a
 * single page. (The admin surface keeps its own frozen AdminPagination.)
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  label = 'Pagination',
  scrollToTop = true,
  scrollTargetRef,
}: PaginationProps) {
  if (totalPages <= 1) return null

  function go(next: number) {
    onPageChange(next)
    if (!scrollToTop) return
    if (scrollTargetRef?.current) {
      scrollTargetRef.current.scrollIntoView({ block: 'start' })
    } else if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0 })
    }
  }

  return (
    <nav className={styles.wrap} aria-label={label}>
      <Button variant="secondary" disabled={page <= 1} onClick={() => go(page - 1)}>
        Previous
      </Button>

      <span className={styles.indicator} aria-live="polite">
        Page {page} of {totalPages}
      </span>

      <Button variant="secondary" disabled={page >= totalPages} onClick={() => go(page + 1)}>
        Next
      </Button>
    </nav>
  )
}
