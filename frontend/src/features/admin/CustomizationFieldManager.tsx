import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCreateCustomizationField } from '@/hooks/useCreateCustomizationField'
import { useUpdateCustomizationField } from '@/hooks/useUpdateCustomizationField'
import {
  customizationFieldSchema,
  toCreateCustomizationFieldPayload,
  type CustomizationFieldFormValues,
} from '@/schemas/adminProduct.schema'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { getApiErrorMessage } from '@/utils/apiError'
import type { CustomizationField } from '@/types/catalog'
import styles from './CustomizationFieldManager.module.css'

const FIELD_TYPE_LABELS: Record<CustomizationFieldFormValues['type'], string> = {
  TEXT: 'Text',
  LOGO_UPLOAD: 'Logo upload',
  IMAGE_UPLOAD: 'Image upload',
  DESIGN_FILE_UPLOAD: 'Design file upload',
  COLOR_SELECT: 'Color select',
  INSTRUCTIONS: 'Instructions',
}

const SURCHARGE_TYPE_LABELS: Record<CustomizationFieldFormValues['surchargeType'], string> = {
  NONE: 'No surcharge',
  FLAT: 'Flat (once per unit)',
  PER_CHARACTER: 'Per character',
}

interface CustomizationFieldManagerProps {
  productId: string
  fields: CustomizationField[]
  onFieldsChange: (fields: CustomizationField[]) => void
}

/** POST/PATCH /products/:id/customization-fields[/:fieldId] only — no
 * delete endpoint (matches variants: nothing in this admin surface removes
 * a field, only edits it). `constraints` is edited as raw JSON text
 * (jsonObjectField in the schema) rather than a bespoke per-type editor —
 * a deliberate scope cut; see the phase report. */
export function CustomizationFieldManager({
  productId,
  fields,
  onFieldsChange,
}: CustomizationFieldManagerProps) {
  const createField = useCreateCustomizationField(productId)
  const updateField = useUpdateCustomizationField(productId)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function handleCreate(values: CustomizationFieldFormValues) {
    try {
      const created = await createField.mutateAsync(toCreateCustomizationFieldPayload(values))
      onFieldsChange([...fields, created])
      setIsAdding(false)
    } catch {
      // Error surfaced via createField.isError below.
    }
  }

  async function handleUpdate(fieldId: string, values: CustomizationFieldFormValues) {
    try {
      const updated = await updateField.mutateAsync({
        fieldId,
        payload: toCreateCustomizationFieldPayload(values),
      })
      onFieldsChange(fields.map((f) => (f.id === fieldId ? updated : f)))
      setEditingId(null)
    } catch {
      // Error surfaced via updateField.isError below.
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Customization fields</h2>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setIsAdding((prev) => !prev)
            setEditingId(null)
          }}
        >
          {isAdding ? 'Cancel' : 'Add field'}
        </Button>
      </div>

      {fields.length === 0 && !isAdding && <p className={styles.empty}>No customization fields yet.</p>}

      {fields.length > 0 && (
        <ul className={styles.list}>
          {fields.map((field) =>
            editingId === field.id ? (
              <li key={field.id} className={styles.row}>
                <CustomizationFieldFormFields
                  defaultValues={{
                    label: field.label,
                    type: field.type,
                    isRequired: field.isRequired,
                    sortOrder: String(field.sortOrder),
                    helpText: field.helpText ?? '',
                    constraints: field.constraints ? JSON.stringify(field.constraints) : '',
                    surchargeType: field.surchargeType,
                    surchargeAmount: field.surchargeAmount === '0.00' ? '' : field.surchargeAmount,
                  }}
                  onSubmit={(values) => void handleUpdate(field.id, values)}
                  onCancel={() => setEditingId(null)}
                  isSubmitting={updateField.isPending}
                  submitError={updateField.isError ? getApiErrorMessage(updateField.error) : null}
                  submitLabel="Save"
                />
              </li>
            ) : (
              <li key={field.id} className={styles.row}>
                <div className={styles.summary}>
                  <span className={styles.label}>{field.label}</span>
                  <span className={styles.meta}>
                    {FIELD_TYPE_LABELS[field.type]}
                    {field.isRequired ? ' · Required' : ''}
                    {field.surchargeType !== 'NONE' ? ` · ${SURCHARGE_TYPE_LABELS[field.surchargeType]}` : ''}
                  </span>
                </div>
                <Button type="button" variant="secondary" onClick={() => setEditingId(field.id)}>
                  Edit
                </Button>
              </li>
            ),
          )}
        </ul>
      )}

      {isAdding && (
        <div className={styles.addForm}>
          <CustomizationFieldFormFields
            defaultValues={{
              label: '',
              type: 'TEXT',
              isRequired: false,
              sortOrder: String(fields.length),
              helpText: '',
              constraints: '',
              surchargeType: 'NONE',
              surchargeAmount: '',
            }}
            onSubmit={(values) => void handleCreate(values)}
            isSubmitting={createField.isPending}
            submitError={createField.isError ? getApiErrorMessage(createField.error) : null}
            submitLabel="Add field"
          />
        </div>
      )}
    </div>
  )
}

interface CustomizationFieldFormFieldsProps {
  defaultValues: {
    label: string
    type: CustomizationFieldFormValues['type']
    isRequired: boolean
    sortOrder: string
    helpText: string
    constraints: string
    surchargeType: CustomizationFieldFormValues['surchargeType']
    surchargeAmount: string
  }
  onSubmit: (values: CustomizationFieldFormValues) => void
  onCancel?: () => void
  isSubmitting: boolean
  submitError: string | null
  submitLabel: string
}

function CustomizationFieldFormFields({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitError,
  submitLabel,
}: CustomizationFieldFormFieldsProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomizationFieldFormValues>({
    resolver: zodResolver(customizationFieldSchema),
    defaultValues,
  })

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
      {submitError && <Alert variant="error">{submitError}</Alert>}

      <div className={styles.formRow}>
        <TextField label="Label" error={errors.label?.message} {...register('label')} />

        <div className={styles.selectField}>
          <label htmlFor="field-type" className={styles.selectLabel}>
            Type
          </label>
          <select id="field-type" className={styles.select} {...register('type')}>
            {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <label className={styles.checkboxLabel}>
          <input type="checkbox" {...register('isRequired')} />
          Required
        </label>
      </div>

      <div className={styles.formRow}>
        <TextField
          label="Sort order"
          type="number"
          min={0}
          error={errors.sortOrder?.message}
          {...register('sortOrder')}
        />

        <div className={styles.selectField}>
          <label htmlFor="field-surcharge-type" className={styles.selectLabel}>
            Surcharge
          </label>
          <select id="field-surcharge-type" className={styles.select} {...register('surchargeType')}>
            {Object.entries(SURCHARGE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <TextField
          label="Surcharge amount (optional)"
          type="number"
          step="0.01"
          error={errors.surchargeAmount?.message}
          {...register('surchargeAmount')}
        />
      </div>

      <TextField label="Help text (optional)" error={errors.helpText?.message} {...register('helpText')} />

      <div className={styles.field}>
        <label htmlFor="field-constraints" className={styles.selectLabel}>
          Constraints (optional JSON — e.g. {'{"maxLength":40}'} or {'{"options":["Red","Blue"]}'})
        </label>
        <textarea
          id="field-constraints"
          className={styles.textarea}
          rows={2}
          {...register('constraints')}
        />
        {errors.constraints?.message && <p className={styles.errorText}>{errors.constraints.message}</p>}
      </div>

      <div className={styles.formActions}>
        <Button type="submit" isLoading={isSubmitting}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
