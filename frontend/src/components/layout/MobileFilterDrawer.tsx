import { useEffect, useRef } from 'react'
import { X, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/Button'
import { FilterSidebar } from './FilterSidebar'
import styles from './MobileFilterDrawer.module.css'

interface MobileFilterDrawerProps {
  isOpen: boolean
  onClose: () => void
  activeCategoryId?: string
  hasActiveFilters: boolean
  onClearAll: () => void
}

export function MobileFilterDrawer({
  isOpen,
  onClose,
  activeCategoryId,
  hasActiveFilters,
  onClearAll,
}: MobileFilterDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
      closeButtonRef.current?.focus()
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      <div
        className={styles.overlay}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        id="mobile-filter-drawer"
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-filter-title"
      >
        <div className={styles.header}>
          <h2 id="mobile-filter-title" className={styles.title}>
            Filters
          </h2>
          <button
            ref={closeButtonRef}
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close filters"
          >
            <X size={24} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.content}>
          {/* No onFiltersChange: changing a filter updates the results
              behind the drawer but never closes it (UX-11). The customer
              closes it deliberately — via "Show results", the X, Escape,
              or the overlay. */}
          <FilterSidebar
            activeCategoryId={activeCategoryId}
            hasActiveFilters={hasActiveFilters}
            onClearAll={onClearAll}
            headingId="mobile-filter-sidebar-title"
          />
        </div>
        <div className={styles.footer}>
          <Button onClick={onClose} className={styles.showResults}>
            Show results
          </Button>
        </div>
      </aside>
    </>
  )
}

interface FilterTriggerProps {
  isOpen: boolean
  onClick: () => void
  hasActiveFilters: boolean
}

export function FilterTrigger({ isOpen, onClick, hasActiveFilters }: FilterTriggerProps) {
  return (
    <button
      className={cn(styles.trigger, hasActiveFilters && styles.triggerActive)}
      onClick={onClick}
      aria-label={isOpen ? 'Close filters' : 'Open filters'}
      aria-expanded={isOpen}
      aria-controls="mobile-filter-drawer"
    >
      <SlidersHorizontal size={20} aria-hidden="true" />
      <span className={styles.triggerText}>Filters</span>
      {hasActiveFilters && <span className={styles.badge} aria-label="Active filters">•</span>}
    </button>
  )
}
