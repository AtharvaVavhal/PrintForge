import type { UseFormRegister } from 'react-hook-form'
import type { CustomizationField } from '@/types/catalog'
import { TextField } from '@/components/ui/TextField'
import { RequiredMark } from '@/components/ui/RequiredMark'
import { computeFieldSurcharge } from '@/utils/customizationPricing'
import { formatPrice } from '@/utils/formatPrice'
import styles from './TextCustomizationField.module.css'

interface FieldConstraints {
  maxLength?: number
}

interface TextCustomizationFieldProps {
  field: CustomizationField
  register: UseFormRegister<Record<string, string>>
  error?: string
  liveValue: string | undefined
}

/**
 * TEXT and INSTRUCTIONS — the two text-bearing types that aren't
 * COLOR_SELECT (see customization-validation.util.ts's "text-bearing
 * types" comment). INSTRUCTIONS renders as a textarea (freeform notes to
 * the printer — every current INSTRUCTIONS field has surchargeType NONE);
 * TEXT as a single-line input, since it's used for short values (mug
 * captions, slogans, engraving text) that often carry a per-character
 * surcharge, shown live as the customer types.
 */
export function TextCustomizationField({
  field,
  register,
  error,
  liveValue,
}: TextCustomizationFieldProps) {
  const constraints = (field.constraints ?? {}) as FieldConstraints
  const surcharge = computeFieldSurcharge(field, liveValue)

  if (field.type === 'INSTRUCTIONS') {
    return (
      <div className={styles.field}>
        <label className={styles.label} htmlFor={field.id}>
          {field.label}
          {field.isRequired && <RequiredMark />}
        </label>
        {field.helpText && <p className={styles.helpText}>{field.helpText}</p>}
        <textarea
          id={field.id}
          className={styles.textarea}
          maxLength={constraints.maxLength}
          aria-invalid={Boolean(error)}
          aria-required={field.isRequired || undefined}
          {...register(field.id)}
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={styles.field}>
      <TextField
        label={field.label}
        required={field.isRequired}
        id={field.id}
        maxLength={constraints.maxLength}
        error={error}
        {...register(field.id)}
      />
      {field.helpText && <p className={styles.helpText}>{field.helpText}</p>}
      {field.surchargeType === 'PER_CHARACTER' && (
        <p className={styles.surchargeHint}>
          +{formatPrice(Number(field.surchargeAmount))} per character
          {surcharge > 0 && ` — ${formatPrice(surcharge)} so far`}
        </p>
      )}
      {field.surchargeType === 'FLAT' && (
        <p className={styles.surchargeHint}>+{formatPrice(Number(field.surchargeAmount))}</p>
      )}
    </div>
  )
}
