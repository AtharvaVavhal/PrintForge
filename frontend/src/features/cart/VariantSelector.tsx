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

/** Native <input type="radio"> group (UX-15), same pattern as
 * features/customization/fields/ColorSelectField.tsx — required before Add
 * to Cart whenever the product has any variants; unavailable variants are
 * shown, labeled, and disabled, never hidden. The browser provides the
 * roving tab stop and Arrow/Home/End selection; the styled <label> stays
 * the visible control and React state stays authoritative. */
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
            <label
              key={variant.id}
              className={cn(
                styles.option,
                selectedVariantId === variant.id && styles.optionSelected,
                disabled && styles.optionDisabled,
              )}
            >
              <input
                type="radio"
                name="product-variant"
                value={variant.id}
                checked={selectedVariantId === variant.id}
                disabled={disabled}
                onChange={() => onChange(variant.id)}
                className={styles.optionInput}
              />
              <span>{variant.label}</span>
              <span className={styles.optionMeta}>
                {Number(variant.priceDelta) !== 0 && `+${formatPrice(variant.priceDelta)}`}
                {disabled && <span className={styles.unavailable}> · Unavailable</span>}
              </span>
            </label>
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
