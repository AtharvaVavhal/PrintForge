import { PackageSearch } from 'lucide-react'
import styles from './EmptyCatalog.module.css'

interface EmptyCatalogProps {
  hasFilter: boolean
}

/**
 * A real designed state, not a blank page — the production catalog
 * currently has zero products (confirmed against the live backend during
 * this phase), so this is the state most real visitors will actually see
 * right now, not a rare edge case.
 */
export function EmptyCatalog({ hasFilter }: EmptyCatalogProps) {
  return (
    <div className={styles.empty}>
      <PackageSearch size={40} strokeWidth={1.5} aria-hidden="true" />
      <h2>{hasFilter ? 'No products match this filter' : 'No products yet'}</h2>
      <p>
        {hasFilter
          ? 'Try a different search or category, or check back soon.'
          : "We're setting up the catalog — check back soon."}
      </p>
    </div>
  )
}
