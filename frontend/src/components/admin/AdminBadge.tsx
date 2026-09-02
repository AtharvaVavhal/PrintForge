import type { ReactNode } from 'react'
import { CircleCheck, TriangleAlert, CircleX, Info, CircleDot } from 'lucide-react'
import { cn } from '@/utils/cn'
import styles from './AdminBadge.module.css'

export type AdminBadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface AdminBadgeProps {
  variant?: AdminBadgeVariant
  children: ReactNode
  className?: string
}

const VARIANT_ICON = {
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
  info: Info,
  neutral: CircleDot,
} as const

/**
 * Generic status pill for the admin UI. Business-specific labels are never
 * hardcoded here — the caller supplies the text (see OrderStatusBadge for
 * the order-status mapping).
 *
 * Non-color cue: each variant carries a distinct, always-rendered
 * `aria-hidden` icon in addition to its colour, so the status is
 * distinguishable without relying on colour perception. The visible label
 * text is itself the primary cue.
 */
export function AdminBadge({ variant = 'neutral', children, className }: AdminBadgeProps) {
  const Icon = VARIANT_ICON[variant]
  return (
    <span className={cn(styles.badge, styles[variant], className)} data-variant={variant}>
      <Icon size={13} strokeWidth={2.5} aria-hidden="true" className={styles.icon} />
      <span className={styles.label}>{children}</span>
    </span>
  )
}
