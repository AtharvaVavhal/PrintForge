import { cn } from '@/utils/cn'
import styles from './Skeleton.module.css'

interface SkeletonProps {
  className?: string
}

/** A pulsing placeholder block for loading states — no such primitive
 * existed before this phase. */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn(styles.skeleton, className)} aria-hidden="true" />
}
