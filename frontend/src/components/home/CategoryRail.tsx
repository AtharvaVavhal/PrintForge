import { Link } from 'react-router-dom'
import { useCategories } from '@/hooks/useCategories'
import { ROUTES } from '@/constants/routes'
import { Skeleton } from '@/components/ui/Skeleton'
import { SectionHeading } from './SectionHeading'
import styles from './CategoryRail.module.css'

/**
 * "Shop by Category" backed by the live public catalogue
 * (GET /categories — active categories only, server-side). Used on the
 * homepage when an admin has not curated a showcase
 * (settings.showcase_categories); CategoryShowcase renders that instead.
 *
 * The Category API carries no imagery, so these are typographic cards —
 * no stock photos or invented category art. Only top-level categories are
 * shown here; sub-categories surface on the listing page's filters.
 */
export function CategoryRail() {
  const { data: categories, isPending, isError } = useCategories()

  if (isError) return null

  const topLevel = (categories ?? []).filter((c) => c.parentCategoryId === null)

  if (!isPending && topLevel.length === 0) return null

  return (
    <section className={styles.section} aria-labelledby="home-categories-heading">
      <SectionHeading
        id="home-categories-heading"
        title="Shop by category"
        viewAllHref={ROUTES.PRODUCTS}
        viewAllLabel="All products"
      />

      {isPending ? (
        <ul className={styles.rail} aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className={styles.item}>
              <Skeleton className={styles.skeletonCard} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.rail}>
          {topLevel.map((category) => (
            <li key={category.id} className={styles.item}>
              <Link
                to={`${ROUTES.PRODUCTS}?categoryId=${encodeURIComponent(category.id)}`}
                className={styles.card}
              >
                <span className={styles.mark} aria-hidden="true">
                  {category.name.charAt(0).toUpperCase()}
                </span>
                <span className={styles.name}>{category.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
