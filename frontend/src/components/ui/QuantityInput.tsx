import { useState } from 'react'
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

/**
 * The +/- buttons emit a clamped number and let the parent (and the
 * server-confirmed value that flows back) drive the display. The text field
 * is looser (UX-33): while it is focused the user may clear it and type
 * freely — the parent isn't told anything until a valid number exists, and
 * the value is clamped to [min, max] on blur (or Enter). This makes
 * "select-all, type 12" and backspacing work naturally, on desktop and
 * mobile, without ever leaving the parent with an out-of-range quantity.
 */
export function QuantityInput({
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
  label = 'Quantity',
  className,
}: QuantityInputProps) {
  const [draft, setDraft] = useState(String(value))
  const [syncedValue, setSyncedValue] = useState(value)
  // True from the first keystroke until the next commit — while set, a value
  // change from elsewhere (e.g. a background refetch) won't yank the field
  // out from under the user mid-edit.
  const [editing, setEditing] = useState(false)

  // Adopt an externally-changed value (server-confirmed cart qty, or a
  // rejected update rolling back to the previous value) unless the user is
  // mid-edit. Render-time reconcile — the React-recommended alternative to a
  // sync effect.
  if (value !== syncedValue) {
    setSyncedValue(value)
    if (!editing) setDraft(String(value))
  }

  function clamp(next: number): number {
    let result = Math.max(min, Math.trunc(next))
    if (max !== undefined) result = Math.min(max, result)
    return result
  }

  function commitDraft() {
    setEditing(false)
    const parsed = Number(draft)
    // Snap the field back to the confirmed value. If `onChange` is accepted
    // the reconcile above re-syncs the draft to the new value; if it's
    // rejected the field simply stays at the confirmed value.
    setDraft(String(value))
    if (draft.trim() === '' || Number.isNaN(parsed)) return
    const clamped = clamp(parsed)
    if (clamped !== value) onChange(clamped)
  }

  function step(delta: number) {
    const next = clamp(value + delta)
    if (next !== value) onChange(next)
  }

  return (
    <div className={cn(styles.wrap, className)}>
      <button
        type="button"
        className={styles.step}
        onClick={() => step(-1)}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label.toLowerCase()}`}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        className={styles.input}
        value={draft}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          setEditing(true)
          setDraft(e.target.value)
        }}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitDraft()
          }
        }}
        aria-label={label}
      />
      <button
        type="button"
        className={styles.step}
        onClick={() => step(1)}
        disabled={disabled || (max !== undefined && value >= max)}
        aria-label={`Increase ${label.toLowerCase()}`}
      >
        +
      </button>
    </div>
  )
}
