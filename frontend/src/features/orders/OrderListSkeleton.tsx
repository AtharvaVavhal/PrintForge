import { Skeleton } from '@/components/ui/Skeleton'
import styles from './OrderListSkeleton.module.css'

const SKELETON_ROW_COUNT = 5

export function OrderListSkeleton() {
  return (
    <div className={styles.list} aria-hidden="true" data-testid="order-list-skeleton">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
        <Skeleton key={i} className={styles.skeletonRow} />
      ))}
    </div>
  )
}
