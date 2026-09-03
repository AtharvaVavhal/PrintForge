import { ProductCardSkeleton } from './ProductCardSkeleton'
import gridStyles from './ProductGrid.module.css'
import styles from './ProductGridSkeleton.module.css'

const SKELETON_CARD_COUNT = 8

export function ProductGridSkeleton({ label }: { label?: string }) {
  const grid = (
    <div className={gridStyles.grid} aria-hidden="true">
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  )

  if (!label) return grid

  return (
    <div role="status">
      <span className={styles.srOnly}>{label}</span>
      {grid}
    </div>
  )
}
