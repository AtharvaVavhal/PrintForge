import { useSearchParams } from 'react-router-dom'
import type { Category } from '@/types/catalog'
import { cn } from '@/utils/cn'
import styles from './CategoryFilter.module.css'

interface CategoryFilterProps {
  categories: Category[]
}

/** Client-side category filtering via the `categoryId` query param — the
 * exact param GET /products accepts (ListProductsQueryDto), so this reads
 * straight through to useProducts()'s params with no extra mapping layer. */
export function CategoryFilter({ categories }: CategoryFilterProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeCategoryId = searchParams.get('categoryId')

  function selectCategory(categoryId: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (categoryId) {
        next.set('categoryId', categoryId)
      } else {
        next.delete('categoryId')
      }
      next.delete('page')
      return next
    })
  }

  return (
    <div className={styles.filter} role="group" aria-label="Filter by category">
      <button
        type="button"
        className={cn(styles.pill, !activeCategoryId && styles.pillActive)}
        onClick={() => selectCategory(null)}
      >
        All
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className={cn(styles.pill, activeCategoryId === category.id && styles.pillActive)}
          onClick={() => selectCategory(category.id)}
        >
          {category.name}
        </button>
      ))}
    </div>
  )
}
