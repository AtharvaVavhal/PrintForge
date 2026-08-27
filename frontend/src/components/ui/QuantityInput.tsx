import { cn } from '@/utils/cn'
import styles from './QuantityInput.module.css'

interface QuantityInputProps {
  value: number
  onChange: (value: number) => void
  /** Absolute floor — UpdateCartItemDto/AddCartItemDto both require
   * quantity >= 1 regardless of any product-specific minQuantity. */
  min?: number
  /** Omit when the caller doesn't know the upper bound (e.g. an existing
   * cart line, where CartItemView carries no minQuantity/maxQuantity) —
   * the server is always the real enforcer of product-specific bounds
   * (§11), this is a client-side nicety only where the bound is known. */
  max?: number
  disabled?: boolean
  label?: string
  className?: string
}

export function QuantityInput({
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
  label = 'Quantity',
  className,
}: QuantityInputProps) {
  function clamp(next: number): number {
    if (Number.isNaN(next)) return value
    let result = Math.max(min, Math.trunc(next))
    if (max !== undefined) result = Math.min(max, result)
    return result
  }

  return (
    <div className={cn(styles.wrap, className)}>
      <button
        type="button"
        className={styles.step}
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label.toLowerCase()}`}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        className={styles.input}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(clamp(e.target.valueAsNumber))}
        aria-label={label}
      />
      <button
        type="button"
        className={styles.step}
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || (max !== undefined && value >= max)}
        aria-label={`Increase ${label.toLowerCase()}`}
      >
        +
      </button>
    </div>
  )
}
