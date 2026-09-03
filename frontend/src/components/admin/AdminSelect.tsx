import { forwardRef } from 'react'
import type { SelectHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/utils/cn'
import styles from './AdminSelect.module.css'

interface AdminSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  /** Hide the label visually but keep it for assistive tech — for compact
   * filter bars where the surrounding context makes the purpose obvious. */
  hideLabel?: boolean
  error?: string
  children: ReactNode
}

/**
 * Labelled `<select>` — the counterpart to the existing `TextField`, for
 * the native selects the admin pages hand-roll in five places (product /
 * category filters, coupon type/scope, order status, settings enums).
 * Same shape as TextField: forwardRef for react-hook-form's `register()`
 * spread, `aria-invalid` + `role="alert"` error wiring.
 */
export const AdminSelect = forwardRef<HTMLSelectElement, AdminSelectProps>(
  ({ label, hideLabel = false, error, id, className, children, ...rest }, ref) => {
    const selectId = id ?? rest.name
    const errorId = error ? `${selectId}-error` : undefined

    return (
      <div className={cn(styles.field, className)}>
        <label
          htmlFor={selectId}
          className={cn(styles.label, hideLabel && 'srOnly')}
        >
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          className={cn(styles.select, error && styles.selectError)}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          {...rest}
        >
          {children}
        </select>
        {error && (
          <p id={errorId} className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)

AdminSelect.displayName = 'AdminSelect'
