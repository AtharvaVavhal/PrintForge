import { forwardRef, useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/utils/cn'
import styles from './TextField.module.css'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  /**
   * Adds an accessible show/hide toggle inside the field (UX-23). Only
   * meaningful with `type="password"`; the toggle swaps it to `text` and
   * back without touching the value or moving focus off the input.
   */
  revealable?: boolean
}

/** Labeled input + error message, wired for react-hook-form's register()
 * spread (`{...register('email')}`). forwardRef so RHF can attach its own
 * ref for focus-on-error and uncontrolled value tracking. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, id, className, revealable = false, type, ...rest }, ref) => {
    const inputId = id ?? rest.name
    const errorId = error ? `${inputId}-error` : undefined
    const describedBy = cn(
      typeof rest['aria-describedby'] === 'string' ? rest['aria-describedby'] : undefined,
      errorId,
    )

    const [revealed, setRevealed] = useState(false)
    const resolvedType = revealable ? (revealed ? 'text' : 'password') : type

    const input = (
      <input
        ref={ref}
        id={inputId}
        type={resolvedType}
        className={cn(
          styles.input,
          error && styles.inputError,
          revealable && styles.inputRevealable,
        )}
        aria-invalid={Boolean(error)}
        {...rest}
        aria-describedby={describedBy || undefined}
      />
    )

    return (
      <div className={cn(styles.field, className)}>
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
        {revealable ? (
          <div className={styles.inputWrap}>
            {input}
            <button
              type="button"
              className={styles.revealButton}
              // A click on the toggle keeps the caret in the input.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setRevealed((value) => !value)}
              aria-label={revealed ? 'Hide password' : 'Show password'}
            >
              {revealed ? (
                <EyeOff size={18} aria-hidden="true" />
              ) : (
                <Eye size={18} aria-hidden="true" />
              )}
            </button>
          </div>
        ) : (
          input
        )}
        {error && (
          <p id={errorId} className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)

TextField.displayName = 'TextField'
