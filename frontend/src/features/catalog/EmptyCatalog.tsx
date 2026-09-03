import { PackageSearch } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

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
    <EmptyState
      icon={PackageSearch}
      title={hasFilter ? 'No products match this filter' : 'No products yet'}
      description={
        hasFilter
          ? 'Try a different search or category, or check back soon.'
          : "We're setting up the catalog — check back soon."
      }
    />
  )
}
