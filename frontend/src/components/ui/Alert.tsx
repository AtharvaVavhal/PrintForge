import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import styles from './Alert.module.css'

interface AlertProps {
  variant?: 'error' | 'success' | 'info'
  children: ReactNode
  /** Override the automatic role in the rare case a caller needs to. */
  role?: 'alert' | 'status'
}

/**
 * Inline, in-flow message block.
 *
 * `role` follows severity (UX-21): `error` is announced assertively
 * (`role="alert"`) because it usually reports something the customer must
 * act on now; `info` / `success` are announced politely (`role="status"`)
 * so they don't interrupt a screen reader mid-sentence. Transient
 * confirmations should use the toast system instead.
 */
export function Alert({ variant = 'info', children, role }: AlertProps) {
  const resolvedRole = role ?? (variant === 'error' ? 'alert' : 'status')
  return (
    <div className={cn(styles.alert, styles[variant])} role={resolvedRole}>
      {children}
    </div>
  )
}
