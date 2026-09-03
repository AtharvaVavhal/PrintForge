import { cn } from '@/utils/cn'
import styles from './Skeleton.module.css'

interface SkeletonProps {
  className?: string
  /**
   * When set, the placeholder is wrapped in a polite `role="status"`
   * region carrying this (visually hidden) text, so a screen reader is
   * told the page is loading instead of hearing nothing. Use it on the
   * page-level skeleton of a route; leave it off for the many small
   * shimmer blocks that make up one skeleton.
   */
  label?: string
}

/** A pulsing placeholder block for loading states — no such primitive
 * existed before this phase. */
export function Skeleton({ className, label }: SkeletonProps) {
  const block = <div className={cn(styles.skeleton, className)} aria-hidden="true" />

  if (!label) return block

  return (
    <div className={styles.status} role="status">
      <span className="srOnly">{label}</span>
      {block}
    </div>
  )
}
