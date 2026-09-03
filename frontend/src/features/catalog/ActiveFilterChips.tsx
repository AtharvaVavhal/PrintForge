import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { useCategoryTree } from '@/hooks/useCategoryTree'
import { findCategoryPath } from './categoryTree'
import { formatPrice } from '@/utils/formatPrice'
import styles from './ActiveFilterChips.module.css'

interface Chip {
  key: string
  label: string
  /** Params to delete when this chip is dismissed. */
  clears: string[]
}

/**
 * Removable summary of the filters currently applied to the listing,
 * driven entirely by the URL query string (the single source of truth —
 * refreshing keeps them). `search` and `sort` are shown for context;
 * `sort` always has a value so it isn't dismissable here.
 */
export function ActiveFilterChips({ onChange }: { onChange?: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: categoryTree = [] } = useCategoryTree()

  const search = searchParams.get('search') ?? undefined
  const categoryId = searchParams.get('categoryId') ?? undefined
  const minPrice = searchParams.get('minPrice') ?? undefined
  const maxPrice = searchParams.get('maxPrice') ?? undefined
  const minRating = searchParams.get('minRating') ?? undefined

  const categoryName = useMemo(() => {
    const path = findCategoryPath(categoryTree, categoryId)
    return path.at(-1)?.name
  }, [categoryTree, categoryId])

  const chips: Chip[] = []
  if (search) {
    chips.push({ key: 'search', label: `“${search}”`, clears: ['search'] })
  }
  if (categoryId && categoryName) {
    chips.push({ key: 'categoryId', label: categoryName, clears: ['categoryId'] })
  }
  if (minPrice || maxPrice) {
    const label =
      minPrice && maxPrice
        ? `${formatPrice(minPrice)} – ${formatPrice(maxPrice)}`
        : minPrice
          ? `From ${formatPrice(minPrice)}`
          : `Up to ${formatPrice(maxPrice as string)}`
    chips.push({ key: 'price', label, clears: ['minPrice', 'maxPrice'] })
  }
  if (minRating) {
    chips.push({ key: 'minRating', label: `${minRating}+ stars`, clears: ['minRating'] })
  }

  if (chips.length === 0) return null

  function removeParams(keys: string[]) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      keys.forEach((k) => next.delete(k))
      next.delete('page')
      return next
    })
    onChange?.()
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>Filters:</span>
      <ul className={styles.chips}>
        {chips.map((chip) => (
          <li key={chip.key}>
            <button
              type="button"
              className={styles.chip}
              onClick={() => removeParams(chip.clears)}
            >
              <span className={styles.chipText}>{chip.label}</span>
              <X size={14} aria-hidden="true" />
              <span className="srOnly">Remove filter {chip.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {chips.length > 1 && (
        <button
          type="button"
          className={styles.clearAll}
          onClick={() =>
            removeParams(['search', 'categoryId', 'minPrice', 'maxPrice', 'minRating'])
          }
        >
          Clear all
        </button>
      )}
    </div>
  )
}
