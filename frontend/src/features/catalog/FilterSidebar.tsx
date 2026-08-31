import { useSearchParams } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import type { FilterState } from '@/types/catalog'
import { SORT_OPTIONS, RATING_OPTIONS } from '@/types/catalog'
import styles from './FilterSidebar.module.css'

interface FilterSidebarProps {
  hasActiveFilters: boolean
}

export function FilterSidebar({ hasActiveFilters }: FilterSidebarProps) {
  const [searchParams, setSearchParams] = useSearchParams()

  const currentFilters: FilterState = {
    minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
    maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
    minRating: searchParams.get('minRating') ? Number(searchParams.get('minRating')) : undefined,
    sort: (searchParams.get('sort') as FilterState['sort']) ?? 'newest',
  }

  function updateFilters(updates: Partial<FilterState>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          next.set(key, String(value))
        } else {
          next.delete(key)
        }
      })
      next.delete('page')
      return next
    })
  }

  function clearAllFilters() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('minPrice')
      next.delete('maxPrice')
      next.delete('minRating')
      next.delete('sort')
      next.delete('page')
      return next
    })
  }

  function handleMinPriceChange(value: string) {
    const num = value ? Number(value) : undefined
    if (num !== undefined && currentFilters.maxPrice !== undefined && num > currentFilters.maxPrice) {
      updateFilters({ minPrice: num, maxPrice: num })
    } else {
      updateFilters({ minPrice: num })
    }
  }

  function handleMaxPriceChange(value: string) {
    const num = value ? Number(value) : undefined
    if (num !== undefined && currentFilters.minPrice !== undefined && num < currentFilters.minPrice) {
      updateFilters({ minPrice: num, maxPrice: num })
    } else {
      updateFilters({ maxPrice: num })
    }
  }

  function handleRatingChange(rating: number) {
    updateFilters({ minRating: currentFilters.minRating === rating ? undefined : rating })
  }

  function handleSortChange(value: string) {
    updateFilters({ sort: value as FilterState['sort'] })
  }

  return (
    <aside className={styles.sidebar} aria-label="Product filters">
      <div className={styles.header}>
        <h2>Filters</h2>
        {hasActiveFilters && (
          <Button variant="ghost" onClick={clearAllFilters} className={styles.clearAll}>
            Clear all
          </Button>
        )}
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Price range</legend>
        <div className={styles.priceInputs}>
          <TextField
            label="Min price"
            type="number"
            name="minPrice"
            value={currentFilters.minPrice ?? ''}
            onChange={(e) => handleMinPriceChange(e.target.value)}
            placeholder="0"
            min="0"
            step="1"
            inputMode="numeric"
          />
          <TextField
            label="Max price"
            type="number"
            name="maxPrice"
            value={currentFilters.maxPrice ?? ''}
            onChange={(e) => handleMaxPriceChange(e.target.value)}
            placeholder="Any"
            min="0"
            step="1"
            inputMode="numeric"
          />
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Minimum rating</legend>
        <div className={styles.ratingOptions} role="radiogroup" aria-label="Minimum rating filter">
          {RATING_OPTIONS.map((rating) => (
            <label key={rating} className={cn(styles.ratingLabel, currentFilters.minRating === rating && styles.ratingActive)}>
              <input
                type="radio"
                name="minRating"
                value={String(rating)}
                checked={currentFilters.minRating === rating}
                onChange={() => handleRatingChange(rating)}
                className={styles.ratingInput}
              />
              <span className={styles.ratingStars}>
                {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
              </span>
              <span className={styles.ratingText}>{rating}+ stars</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Sort by</legend>
        <select
          value={currentFilters.sort}
          onChange={(e) => handleSortChange(e.target.value)}
          className={styles.sortSelect}
          aria-label="Sort products"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </fieldset>
    </aside>
  )
}
