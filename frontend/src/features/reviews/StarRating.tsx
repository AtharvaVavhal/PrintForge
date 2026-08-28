import styles from './StarRating.module.css'

interface StarRatingProps {
  avgRating: string | null
  reviewCount: number
  compact?: boolean
}

const STAR_COUNT = 5

/** Read-only rating display — Product.avgRating/reviewCount, already
 * returned by GET /products/:slug (confirmed against products.service.ts's
 * PRODUCT_DETAIL_INCLUDE, which returns full scalar columns with no
 * select-list stripping them). Renders nothing when there are no reviews
 * yet rather than a misleading "0 stars". */
export function StarRating({ avgRating, reviewCount, compact = false }: StarRatingProps) {
  if (reviewCount <= 0 || avgRating === null) {
    return (
      <p className={compact ? `${styles.empty} ${styles.compact}` : styles.empty}>
        No reviews yet
      </p>
    )
  }

  const rounded = Math.round(Number(avgRating))

  return (
    <p
      className={compact ? `${styles.wrap} ${styles.compact}` : styles.wrap}
      aria-label={`Rated ${avgRating} out of 5 stars, from ${reviewCount} review${reviewCount === 1 ? '' : 's'}`}
    >
      <span className={styles.stars} aria-hidden="true">
        {Array.from({ length: STAR_COUNT }, (_, i) => (
          <span key={i} className={i < rounded ? styles.starFilled : styles.starEmpty}>
            ★
          </span>
        ))}
      </span>
      <span className={styles.value}>{avgRating}</span>
      <span className={styles.count}>
        ({reviewCount} review{reviewCount === 1 ? '' : 's'})
      </span>
    </p>
  )
}
