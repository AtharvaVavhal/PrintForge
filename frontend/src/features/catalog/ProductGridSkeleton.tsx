import { Skeleton } from '@/components/ui/Skeleton'
import styles from './ProductGrid.module.css'

const SKELETON_CARD_COUNT = 8

export function ProductGridSkeleton() {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => (
        <div key={i} className={styles.skeletonCard}>
          <Skeleton className={styles.skeletonImage} />
          <Skeleton className={styles.skeletonLine} />
          <Skeleton className={styles.skeletonLineShort} />
        </div>
      ))}
    </div>
  )
}
