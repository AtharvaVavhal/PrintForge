import { cn } from '@/utils/cn'
import styles from './Stars.module.css'

const STAR_COUNT = 5

interface StarsProps {
  /** 0–5; rounded to the nearest whole star for display. */
  value: number
  /** Slightly smaller glyphs for dense contexts (product cards). */
  compact?: boolean
  /** Accessible name for the whole control. When omitted the glyphs are
   * purely decorative (`aria-hidden`) and the caller is responsible for a
   * nearby text label. */
  'aria-label'?: string
  className?: string
}

/**
 * The one read-only star-rating glyph row for the storefront — replaces
 * the near-identical `★`/`☆` loops previously duplicated in StarRating,
 * ReviewList and FilterSidebar. Display only; it renders nothing about
 * "no reviews" (callers decide that).
 */
export function Stars({ value, compact = false, className, ...rest }: StarsProps) {
  const label = rest['aria-label']
  const filled = Math.max(0, Math.min(STAR_COUNT, Math.round(value)))

  return (
    <span
      className={cn(styles.stars, compact && styles.compact, className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: STAR_COUNT }, (_, i) => (
        <span key={i} className={i < filled ? styles.filled : styles.empty}>
          ★
        </span>
      ))}
    </span>
  )
}
