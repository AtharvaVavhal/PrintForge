import type { ProductVariant } from '@/types/catalog'
import { cn } from '@/utils/cn'
import { formatPrice } from '@/utils/formatPrice'
import styles from './VariantSelector.module.css'

interface VariantSelectorProps {
  variants: ProductVariant[]
  selectedVariantId: string | null
  onChange: (variantId: string) => void
  error?: string
}

/** Same selectable-button radiogroup pattern as
 * features/customization/fields/ColorSelectField.tsx — required before Add
 * to Cart whenever the product has any variants; unavailable variants are
 * shown, labeled, and disabled, never hidden. */
export function VariantSelector({
  variants,
  selectedVariantId,
  onChange,
  error,
}: VariantSelectorProps) {
  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>Options</legend>

      <div className={styles.options} role="radiogroup" aria-label="Options">
        {variants.map((variant) => {
          const disabled = !variant.isAvailable
          return (
            <button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={selectedVariantId === variant.id}
              disabled={disabled}
              className={cn(
                styles.option,
                selectedVariantId === variant.id && styles.optionSelected,
                disabled && styles.optionDisabled,
              )}
              onClick={() => onChange(variant.id)}
            >
              <span>{variant.label}</span>
              <span className={styles.optionMeta}>
                {Number(variant.priceDelta) !== 0 && `+${formatPrice(variant.priceDelta)}`}
                {disabled && <span className={styles.unavailable}> · Unavailable</span>}
              </span>
            </button>
          )
        })}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}
