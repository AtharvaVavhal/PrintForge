import type { CustomizationField } from '@/types/catalog'
import { cn } from '@/utils/cn'
import styles from './ColorSelectField.module.css'

interface FieldConstraints {
  options?: string[]
}

interface ColorSelectFieldProps {
  field: CustomizationField
  value: string
  onChange: (value: string) => void
  error?: string
}

/**
 * Renders CustomizationField.constraints.options (e.g. ["White", "Black",
 * "Red"] — see prisma/seed-production.ts) as a set of selectable swatches.
 * The submitted value is the option's own label string, exactly what
 * customization-validation.util.ts checks
 * (constraints.options.includes(textValue)) — not an index or a hex
 * code, since neither the schema nor any seeded data defines one.
 */
export function ColorSelectField({ field, value, onChange, error }: ColorSelectFieldProps) {
  const constraints = (field.constraints ?? {}) as FieldConstraints
  const options = constraints.options ?? []

  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>
        {field.label}
        {field.isRequired && <span className={styles.required}> *</span>}
      </legend>
      {field.helpText && <p className={styles.helpText}>{field.helpText}</p>}

      <div className={styles.options} role="radiogroup" aria-label={field.label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            className={cn(styles.option, value === option && styles.optionSelected)}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}
