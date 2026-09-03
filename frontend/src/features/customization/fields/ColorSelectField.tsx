import type { CustomizationField } from '@/types/catalog'
import { cn } from '@/utils/cn'
import { RequiredMark } from '@/components/ui/RequiredMark'
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

/** Common print/apparel colour names → a swatch fill. A name that isn't
 * here simply renders as a text-only option (no guessed colour). */
const SWATCH_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#1a1a1a',
  red: '#d8452c',
  blue: '#2563eb',
  navy: '#1e3a5f',
  green: '#16a34a',
  yellow: '#facc15',
  orange: '#f97316',
  purple: '#7c3aed',
  pink: '#ec4899',
  grey: '#9ca3af',
  gray: '#9ca3af',
  brown: '#92400e',
  beige: '#e8d9c0',
  cream: '#fdf6e3',
  maroon: '#7f1d1d',
  gold: '#d4af37',
  silver: '#c0c0c0',
  teal: '#0d9488',
}

function swatchFor(option: string): string | undefined {
  return SWATCH_COLORS[option.trim().toLowerCase()]
}

/**
 * Renders CustomizationField.constraints.options (e.g. ["White", "Black",
 * "Red"] — see prisma/seed-production.ts) as selectable options. When an
 * option name is a recognised colour it gets a colour swatch next to the
 * label (UX-39); the label text stays for the accessible name and for
 * names with no swatch. The submitted value is the option's own label
 * string, exactly what customization-validation.util.ts checks — not an
 * index or a hex code.
 */
export function ColorSelectField({ field, value, onChange, error }: ColorSelectFieldProps) {
  const constraints = (field.constraints ?? {}) as FieldConstraints
  const options = constraints.options ?? []

  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>
        {field.label}
        {field.isRequired && <RequiredMark />}
      </legend>
      {field.helpText && <p className={styles.helpText}>{field.helpText}</p>}

      <div
        className={styles.options}
        role="radiogroup"
        aria-label={field.label}
        aria-required={field.isRequired || undefined}
      >
        {options.map((option) => {
          const swatch = swatchFor(option)
          return (
            <label
              key={option}
              className={cn(styles.option, value === option && styles.optionSelected)}
            >
              {/* Native <input type="radio"> (UX-15): the browser gives the
                  group its roving tab stop and Arrow/Home/End selection for
                  free. Visually hidden but focusable; the styled <label> is
                  the visible control, exactly as before. React state stays
                  the single source of truth via `checked` + `onChange`. */}
              <input
                type="radio"
                name={field.id}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                className={styles.optionInput}
              />
              {swatch && (
                <span
                  className={styles.swatch}
                  style={{ background: swatch }}
                  aria-hidden="true"
                />
              )}
              {option}
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
