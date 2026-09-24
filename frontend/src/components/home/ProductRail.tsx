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
  /** Minimum result count required to render this rail at all — a shelf
   * with only one or two items reads as broken/sparse, which is worse than
   * no shelf. Default 1 (render on any result), matching the original
   * "only hide on a truly empty result" behavior. Per-category rails pass
   * a higher floor so a thin category doesn't surface a half-empty row —
   * this holds regardless of how much catalogue data exists overall. */
  minItems?: number
}

const SKELETON_COUNT = 5

/**
 * A single horizontally-scrolling product discovery row on the homepage.
 * Backed entirely by GET /products. If the query errors or returns fewer
 * than `minItems` results the whole section is omitted — a storefront rail
 * should never render an error or a shelf too thin to look intentional.
 */
export function ProductRail({ id, title, params, viewAllHref, minItems = 1 }: ProductRailProps) {
  const { data, isPending, isError } = useProducts({ limit: 12, ...params })

  if (isError) return null

  const items = data?.items ?? []
  if (!isPending && items.length < minItems) return null

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
