import { Fragment, useId, useState } from 'react'
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
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminTable } from '@/components/admin/AdminTable'
import { AdminBadge } from '@/components/admin/AdminBadge'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { formatPrice } from '@/utils/formatPrice'
import { getApiErrorMessage } from '@/utils/apiError'
import type { ProductVariant } from '@/types/catalog'
import styles from './VariantManager.module.css'

interface VariantManagerProps {
  productId: string
  variants: ProductVariant[]
  onVariantsChange: (variants: ProductVariant[]) => void
}

const TABLE_COLUMNS = 4

/**
 * POST/PATCH /products/:id/variants[/:variantId] only — no delete
 * endpoint (a variant is "removed" from sale via isAvailable:false, same
 * soft-disable spirit as Product.isActive). At most one row edits at a
 * time (`editingId`).
 */
export function VariantManager({ productId, variants, onVariantsChange }: VariantManagerProps) {
  const headingId = useId()
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
      // Error surfaced via createVariant.isError in the add form.
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
      // Error surfaced via updateVariant.isError in the edit form.
    }
  }

  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <div className={styles.header}>
        <h2 id={headingId} className={styles.heading}>
          Variants
        </h2>
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

      {isAdding && (
        <AdminCard as="section" title="New variant">
          <VariantFormFields
            defaultValues={{ label: '', priceDelta: '', isAvailable: true }}
            onSubmit={(values) => void handleCreate(values)}
            isSubmitting={createVariant.isPending}
            submitError={createVariant.isError ? getApiErrorMessage(createVariant.error) : null}
            submitLabel="Add variant"
          />
        </AdminCard>
      )}

      {variants.length === 0 ? (
        <AdminEmptyState
          title="No variants yet"
          description="Add a variant to offer this product in more than one option."
        />
      ) : (
        <AdminCard flush>
          <AdminTable caption="Product variants">
            <AdminTable.Head>
              <AdminTable.Row>
                <AdminTable.HeaderCell>Label</AdminTable.HeaderCell>
                <AdminTable.HeaderCell align="end">Price delta</AdminTable.HeaderCell>
                <AdminTable.HeaderCell>Availability</AdminTable.HeaderCell>
                <AdminTable.HeaderCell>Actions</AdminTable.HeaderCell>
              </AdminTable.Row>
            </AdminTable.Head>
            <AdminTable.Body>
              {variants.map((variant) => (
                <Fragment key={variant.id}>
                  <AdminTable.Row>
                    <AdminTable.Cell>
                      <span className={styles.label}>{variant.label}</span>
                    </AdminTable.Cell>
                    <AdminTable.Cell align="end">
                      {Number(variant.priceDelta) !== 0 ? formatPrice(variant.priceDelta) : '—'}
                    </AdminTable.Cell>
                    <AdminTable.Cell>
                      {variant.isAvailable ? (
                        <AdminBadge variant="success">Available</AdminBadge>
                      ) : (
                        <AdminBadge variant="neutral">Unavailable</AdminBadge>
                      )}
                    </AdminTable.Cell>
                    <AdminTable.Cell>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setEditingId(variant.id)
                          setIsAdding(false)
                        }}
                      >
                        Edit
                      </Button>
                    </AdminTable.Cell>
                  </AdminTable.Row>
                  {editingId === variant.id && (
                    <AdminTable.Row>
                      <AdminTable.Cell colSpan={TABLE_COLUMNS}>
                        <AdminCard as="section" title="Edit variant">
                          <VariantFormFields
                            defaultValues={{
                              label: variant.label,
                              priceDelta: variant.priceDelta === '0.00' ? '' : variant.priceDelta,
                              isAvailable: variant.isAvailable,
                            }}
                            onSubmit={(values) => void handleUpdate(variant.id, values)}
                            onCancel={() => setEditingId(null)}
                            isSubmitting={updateVariant.isPending}
                            submitError={
                              updateVariant.isError ? getApiErrorMessage(updateVariant.error) : null
                            }
                            submitLabel="Save"
                          />
                        </AdminCard>
                      </AdminTable.Cell>
                    </AdminTable.Row>
                  )}
                </Fragment>
              ))}
            </AdminTable.Body>
          </AdminTable>
        </AdminCard>
      )}
    </section>
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
