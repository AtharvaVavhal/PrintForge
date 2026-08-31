import { Skeleton } from '@/components/ui/Skeleton';
import styles from './ProductCardSkeleton.module.css';

export function ProductCardSkeleton() {
  return (
    <article className={styles.card} aria-hidden="true">
      <Skeleton className={styles.image} />
      <div className={styles.body}>
        <Skeleton className={styles.name} />
        <Skeleton className={styles.rating} />
        <Skeleton className={styles.price} />
        <Skeleton className={styles.swatches} />
      </div>
    </article>
  );
}