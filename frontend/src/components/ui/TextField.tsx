import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'
import styles from './TextField.module.css'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

/** Labeled input + error message, wired for react-hook-form's register()
 * spread (`{...register('email')}`). forwardRef so RHF can attach its own
 * ref for focus-on-error and uncontrolled value tracking. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, id, className, ...rest }, ref) => {
    const inputId = id ?? rest.name
    const errorId = error ? `${inputId}-error` : undefined

    return (
      <div className={cn(styles.field, className)}>
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={cn(styles.input, error && styles.inputError)}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          {...rest}
        />
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
