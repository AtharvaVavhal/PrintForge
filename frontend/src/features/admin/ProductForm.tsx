import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { adminProductSchema, type AdminProductFormValues } from '@/schemas/adminProduct.schema'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { AdminSelect } from '@/components/admin/AdminSelect'
import type { Category } from '@/types/catalog'
import styles from './ProductForm.module.css'

interface ProductFormProps {
  categories: Category[]
  defaultValues: AdminProductFormValues
  isSubmitting: boolean
  submitError: string | null
  submitLabel: string
  onSubmit: (values: AdminProductFormValues) => void
}

/**
 * Base product fields only (categoryId, name, slug, basePrice,
 * minQuantity, maxQuantity, specifications) — variants, customization
 * fields, and images are managed by their own sibling components on
 * AdminProductDetailPage, since they're separate endpoints with their own
 * success/error states, not sub-fields of one PATCH /products/:id body.
 */
export function ProductForm({
  categories,
  defaultValues,
  isSubmitting,
  submitError,
  submitLabel,
  onSubmit,
}: ProductFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminProductFormValues>({
    resolver: zodResolver(adminProductSchema),
    defaultValues,
  })

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
      {submitError && <Alert variant="error">{submitError}</Alert>}

      <AdminSelect
        label="Category"
        error={errors.categoryId?.message}
        {...register('categoryId')}
      >
        <option value="">Select a category…</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </AdminSelect>

      <TextField label="Name" error={errors.name?.message} {...register('name')} />
      <TextField label="Slug" error={errors.slug?.message} {...register('slug')} />

      <div className={styles.row}>
        <TextField
          label="Base price"
          type="number"
          step="0.01"
          error={errors.basePrice?.message}
          {...register('basePrice')}
        />
        <TextField
          label="Minimum quantity"
          type="number"
          min={1}
          error={errors.minQuantity?.message}
          {...register('minQuantity')}
        />
        <TextField
          label="Maximum quantity (optional)"
          type="number"
          min={1}
          error={errors.maxQuantity?.message}
          {...register('maxQuantity')}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="product-specifications" className={styles.textareaLabel}>
          Specifications (optional JSON — e.g. {'{"material":"ceramic","capacityMl":350}'})
        </label>
        <textarea
          id="product-specifications"
          className={styles.textarea}
          rows={3}
          {...register('specifications')}
        />
        {errors.specifications?.message && (
          <p className={styles.errorText}>{errors.specifications.message}</p>
        )}
      </div>

      <Button type="submit" isLoading={isSubmitting} className={styles.submit}>
        {submitLabel}
      </Button>
    </form>
  )
}
