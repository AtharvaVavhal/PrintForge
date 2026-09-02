import { useProducts } from '@/hooks/useProducts'
import type { ListProductsParams } from '@/types/catalog'
import { ProductCard } from '@/features/catalog/ProductCard'
import { ProductCardSkeleton } from '@/features/catalog/ProductCardSkeleton'
import { SectionHeading } from './SectionHeading'
import styles from './ProductRail.module.css'

interface ProductRailProps {
  id: string
  title: string
  /** Server-side query — sort / minRating / categoryId etc. The rail shows
   * exactly what the API returns for these params; it never re-ranks or
   * fabricates a "featured" order client-side. */
  params: ListProductsParams
  /** Where "View all" points — a listing-page URL carrying the same intent. */
  viewAllHref: string
}

const SKELETON_COUNT = 5

/**
 * A single horizontally-scrolling product discovery row on the homepage.
 * Backed entirely by GET /products. If the query errors or returns nothing
 * the whole section is omitted — a storefront rail should never render an
 * error or an empty shelf.
 */
export function ProductRail({ id, title, params, viewAllHref }: ProductRailProps) {
  const { data, isPending, isError } = useProducts({ limit: 12, ...params })

  if (isError) return null

  const items = data?.items ?? []
  if (!isPending && items.length === 0) return null

  return (
    <section className={styles.section} aria-labelledby={id}>
      <SectionHeading id={id} title={title} viewAllHref={viewAllHref} />

      <ul className={styles.rail}>
        {isPending
          ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <li key={i} className={styles.item} aria-hidden="true">
                <ProductCardSkeleton />
              </li>
            ))
          : items.map((product) => (
              <li key={product.id} className={styles.item}>
                <ProductCard product={product} />
              </li>
            ))}
      </ul>
    </section>
  )
}
