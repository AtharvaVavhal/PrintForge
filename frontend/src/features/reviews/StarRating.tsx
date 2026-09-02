import { Stars } from '@/components/ui/Stars'
import styles from './StarRating.module.css'

interface StarRatingProps {
  avgRating: string | null
  reviewCount: number
  compact?: boolean
}

/** Read-only rating display — Product.avgRating/reviewCount. Renders
 * nothing (a muted "No reviews yet") when there are none rather than a
 * misleading "0 stars". The star glyphs come from the shared <Stars>
 * primitive (UX-18). */
export function StarRating({ avgRating, reviewCount, compact = false }: StarRatingProps) {
  if (reviewCount <= 0 || avgRating === null) {
    return (
      <p className={compact ? `${styles.empty} ${styles.compact}` : styles.empty}>
        No reviews yet
      </p>
    )
  }

  return (
    <p
      className={compact ? `${styles.wrap} ${styles.compact}` : styles.wrap}
      aria-label={`Rated ${avgRating} out of 5 stars, from ${reviewCount} review${reviewCount === 1 ? '' : 's'}`}
    >
      <Stars value={Number(avgRating)} compact={compact} />
      <span className={styles.value}>{avgRating}</span>
      <span className={styles.count}>
        ({reviewCount} review{reviewCount === 1 ? '' : 's'})
      </span>
    </p>
  )
}
