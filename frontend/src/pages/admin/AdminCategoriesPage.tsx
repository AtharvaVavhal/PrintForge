import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAdminCategories } from '@/hooks/useAdminCategories'
import { useCreateCategory } from '@/hooks/useCreateCategory'
import { useUpdateCategory } from '@/hooks/useUpdateCategory'
import { useDeactivateCategory } from '@/hooks/useDeactivateCategory'
import { useReactivateCategory } from '@/hooks/useReactivateCategory'
import {
  adminCategorySchema,
  toCreateCategoryPayload,
  type AdminCategoryFormValues,
} from '@/schemas/adminCategory.schema'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { TextField } from '@/components/ui/TextField'
import { getApiErrorMessage } from '@/utils/apiError'
import type { Category } from '@/types/catalog'
import styles from './AdminCategoriesPage.module.css'

const EMPTY_VALUES: AdminCategoryFormValues = { name: '', slug: '', parentCategoryId: '' }

/**
 * Behind AdminRoute (App.tsx). Lists every category — active AND inactive
 * — via GET /categories/admin, so a deactivated category stays
 * manageable. Create/edit (POST/PATCH /categories) plus deactivate
 * (DELETE /categories/:id) and reactivate (POST /categories/:id/
 * reactivate). The public GET /categories / GET /categories/tree stay
 * active-only, so an inactive category disappears from the storefront but
 * not from this page.
 */
export function AdminCategoriesPage() {
  const categoriesQuery = useAdminCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const deactivateCategory = useDeactivateCategory()
  const reactivateCategory = useReactivateCategory()
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const statusError = deactivateCategory.isError
    ? getApiErrorMessage(deactivateCategory.error)
    : reactivateCategory.isError
      ? getApiErrorMessage(reactivateCategory.error)
      : null

  async function handleCreate(values: AdminCategoryFormValues) {
    try {
      await createCategory.mutateAsync(toCreateCategoryPayload(values))
      setIsAdding(false)
    } catch {
      // Error surfaced via createCategory.isError below.
    }
  }

  async function handleUpdate(id: string, values: AdminCategoryFormValues) {
    try {
      await updateCategory.mutateAsync({ id, payload: toCreateCategoryPayload(values) })
      setEditingId(null)
    } catch {
      // Error surfaced via updateCategory.isError below.
    }
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <h1>Categories</h1>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setIsAdding((prev) => !prev)
            setEditingId(null)
          }}
        >
          {isAdding ? 'Cancel' : 'New category'}
        </Button>
      </div>

      {categoriesQuery.isPending && <Skeleton className={styles.skeletonBlock} />}

      {categoriesQuery.isError && <Alert variant="error">{getApiErrorMessage(categoriesQuery.error)}</Alert>}

      {statusError && <Alert variant="error">{statusError}</Alert>}

      {categoriesQuery.data && categoriesQuery.data.length === 0 && !isAdding && (
        <p className={styles.empty}>No categories yet.</p>
      )}

      {categoriesQuery.data && categoriesQuery.data.length > 0 && (
        <ul className={styles.list}>
          {categoriesQuery.data.map((category) =>
            editingId === category.id ? (
              <li key={category.id} className={styles.row}>
                <CategoryFormFields
                  categories={categoriesQuery.data.filter((c) => c.id !== category.id)}
                  defaultValues={{
                    name: category.name,
                    slug: category.slug,
                    parentCategoryId: category.parentCategoryId ?? '',
                  }}
                  onSubmit={(values) => void handleUpdate(category.id, values)}
                  onCancel={() => setEditingId(null)}
                  isSubmitting={updateCategory.isPending}
                  submitError={updateCategory.isError ? getApiErrorMessage(updateCategory.error) : null}
                  submitLabel="Save"
                />
              </li>
            ) : (
              <li key={category.id} className={styles.row}>
                <div className={styles.summary}>
                  <span className={styles.name}>
                    {category.name}
                    {!category.isActive && (
                      <span className={styles.inactiveFlag}> · Inactive</span>
                    )}
                  </span>
                  <span className={styles.meta}>
                    {category.slug}
                    {category.parentCategoryId &&
                      ` · under ${categoriesQuery.data.find((c) => c.id === category.parentCategoryId)?.name ?? category.parentCategoryId}`}
                  </span>
                </div>
                <div className={styles.rowActions}>
                  <Button type="button" variant="secondary" onClick={() => setEditingId(category.id)}>
                    Edit
                  </Button>
                  {category.isActive ? (
                    <Button
                      type="button"
                      variant="secondary"
                      isLoading={
                        deactivateCategory.isPending &&
                        deactivateCategory.variables === category.id
                      }
                      onClick={() => deactivateCategory.mutate(category.id)}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      isLoading={
                        reactivateCategory.isPending &&
                        reactivateCategory.variables === category.id
                      }
                      onClick={() => reactivateCategory.mutate(category.id)}
                    >
                      Reactivate
                    </Button>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {isAdding && categoriesQuery.data && (
        <div className={styles.addForm}>
          <CategoryFormFields
            categories={categoriesQuery.data}
            defaultValues={EMPTY_VALUES}
            onSubmit={(values) => void handleCreate(values)}
            isSubmitting={createCategory.isPending}
            submitError={createCategory.isError ? getApiErrorMessage(createCategory.error) : null}
            submitLabel="Create category"
          />
        </div>
      )}
    </section>
  )
}

interface CategoryFormFieldsProps {
  categories: Category[]
  defaultValues: AdminCategoryFormValues
  onSubmit: (values: AdminCategoryFormValues) => void
  onCancel?: () => void
  isSubmitting: boolean
  submitError: string | null
  submitLabel: string
}

function CategoryFormFields({
  categories,
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitError,
  submitLabel,
}: CategoryFormFieldsProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminCategoryFormValues>({
    resolver: zodResolver(adminCategorySchema),
    defaultValues,
  })

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
      {submitError && <Alert variant="error">{submitError}</Alert>}
      <div className={styles.formRow}>
        <TextField label="Name" error={errors.name?.message} {...register('name')} />
        <TextField label="Slug" error={errors.slug?.message} {...register('slug')} />
        <div className={styles.selectField}>
          <label htmlFor="category-parent" className={styles.selectLabel}>
            Parent category (optional)
          </label>
          <select id="category-parent" className={styles.select} {...register('parentCategoryId')}>
            <option value="">None</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
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
