import { Link } from 'react-router-dom'
import type { Category } from '@/types/catalog'
import { categoryProductsPath } from '@/constants/routes'
import styles from './CategoryGrid.module.css'

/**
 * Category has no icon/image field (types/catalog.ts) — rather than
 * hand-picking an icon per category name (which silently breaks the
 * moment a new category is added in the admin), every card gets the same
 * placeholder treatment: the category's own first letter, derived purely
 * from `category.name`, in a single consistent accent-colored circle.
 */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <div className={styles.grid}>
      {categories.map((category) => (
        <Link key={category.id} to={categoryProductsPath(category.id)} className={styles.card}>
          <span className={styles.avatar} aria-hidden="true">
            {category.name.charAt(0).toUpperCase()}
          </span>
          <span className={styles.name}>{category.name}</span>
        </Link>
      ))}
    </div>
  )
}
