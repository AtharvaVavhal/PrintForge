import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCreateVariant } from '@/hooks/useCreateVariant'
import { useUpdateVariant } from '@/hooks/useUpdateVariant'
import {
  toCreateVariantPayload,
  variantSchema,
  type VariantFormValues,
} from '@/schemas/adminProduct.schema'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { formatPrice } from '@/utils/formatPrice'
import { getApiErrorMessage } from '@/utils/apiError'
import type { ProductVariant } from '@/types/catalog'
import styles from './VariantManager.module.css'

interface VariantManagerProps {
  productId: string
  variants: ProductVariant[]
  onVariantsChange: (variants: ProductVariant[]) => void
}

/**
 * POST/PATCH /products/:id/variants[/:variantId] only — no delete
 * endpoint exists (a variant is "removed" from sale via isAvailable:false,
 * same soft-disable spirit as Product.isActive). At most one row edits at
 * a time (`editingId`), so the single shared `updateVariant` mutation's
 * pending/error state unambiguously belongs to whichever row is open.
 */
export function VariantManager({ productId, variants, onVariantsChange }: VariantManagerProps) {
  const createVariant = useCreateVariant(productId)
  const updateVariant = useUpdateVariant(productId)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function handleCreate(values: VariantFormValues) {
    try {
      const created = await createVariant.mutateAsync(toCreateVariantPayload(values))
      onVariantsChange([...variants, created])
      setIsAdding(false)
    } catch {
      // Error surfaced via createVariant.isError below; form stays open
      // with what was typed.
    }
  }

  async function handleUpdate(variantId: string, values: VariantFormValues) {
    try {
      const updated = await updateVariant.mutateAsync({
        variantId,
        payload: toCreateVariantPayload(values),
      })
      onVariantsChange(variants.map((v) => (v.id === variantId ? updated : v)))
      setEditingId(null)
    } catch {
      // Error surfaced via updateVariant.isError below; row stays in edit mode.
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Variants</h2>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setIsAdding((prev) => !prev)
            setEditingId(null)
          }}
        >
          {isAdding ? 'Cancel' : 'Add variant'}
        </Button>
      </div>

      {variants.length === 0 && !isAdding && <p className={styles.empty}>No variants yet.</p>}

      {variants.length > 0 && (
        <ul className={styles.list}>
          {variants.map((variant) =>
            editingId === variant.id ? (
              <li key={variant.id} className={styles.row}>
                <VariantFormFields
                  defaultValues={{
                    label: variant.label,
                    priceDelta: variant.priceDelta === '0.00' ? '' : variant.priceDelta,
                    isAvailable: variant.isAvailable,
                  }}
                  onSubmit={(values) => void handleUpdate(variant.id, values)}
                  onCancel={() => setEditingId(null)}
                  isSubmitting={updateVariant.isPending}
                  submitError={updateVariant.isError ? getApiErrorMessage(updateVariant.error) : null}
                  submitLabel="Save"
                />
              </li>
            ) : (
              <li key={variant.id} className={styles.row}>
                <span className={styles.label}>{variant.label}</span>
                <span className={styles.delta}>
                  {Number(variant.priceDelta) !== 0 ? formatPrice(variant.priceDelta) : '—'}
                </span>
                {!variant.isAvailable && <span className={styles.flag}>Unavailable</span>}
                <Button type="button" variant="secondary" onClick={() => setEditingId(variant.id)}>
                  Edit
                </Button>
              </li>
            ),
          )}
        </ul>
      )}

      {isAdding && (
        <div className={styles.addForm}>
          <VariantFormFields
            defaultValues={{ label: '', priceDelta: '', isAvailable: true }}
            onSubmit={(values) => void handleCreate(values)}
            isSubmitting={createVariant.isPending}
            submitError={createVariant.isError ? getApiErrorMessage(createVariant.error) : null}
            submitLabel="Add variant"
          />
        </div>
      )}
    </div>
  )
}

interface VariantFormFieldsProps {
  defaultValues: { label: string; priceDelta: string; isAvailable: boolean }
  onSubmit: (values: VariantFormValues) => void
  onCancel?: () => void
  isSubmitting: boolean
  submitError: string | null
  submitLabel: string
}

function VariantFormFields({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitError,
  submitLabel,
}: VariantFormFieldsProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VariantFormValues>({
    resolver: zodResolver(variantSchema),
    defaultValues,
  })

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
      {submitError && <Alert variant="error">{submitError}</Alert>}
      <div className={styles.formRow}>
        <TextField label="Label" error={errors.label?.message} {...register('label')} />
        <TextField
          label="Price delta (optional)"
          type="number"
          step="0.01"
          error={errors.priceDelta?.message}
          {...register('priceDelta')}
        />
        <label className={styles.checkboxLabel}>
          <input type="checkbox" {...register('isAvailable')} />
          Available
        </label>
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
