import { ProductCardSkeleton } from './ProductCardSkeleton'
import styles from './ProductGrid.module.css'

const SKELETON_CARD_COUNT = 8

export function ProductGridSkeleton() {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  )
}
