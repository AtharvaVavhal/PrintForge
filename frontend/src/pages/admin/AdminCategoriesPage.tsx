import { Fragment, useState } from 'react'
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
  toUpdateCategoryPayload,
  type AdminCategoryFormValues,
} from '@/schemas/adminCategory.schema'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { TextField } from '@/components/ui/TextField'
import { AdminPage } from '@/components/admin/AdminPage'
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminTable } from '@/components/admin/AdminTable'
import { AdminBadge } from '@/components/admin/AdminBadge'
import { AdminSelect } from '@/components/admin/AdminSelect'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { AdminPageSkeleton } from '@/components/admin/AdminPageSkeleton'
import { getApiErrorMessage } from '@/utils/apiError'
import type { Category } from '@/types/catalog'
import { sortCategoriesForDisplay, getDescendantIds } from './adminCategoryTree'
import styles from './AdminCategoriesPage.module.css'

const EMPTY_VALUES: AdminCategoryFormValues = { name: '', slug: '', parentCategoryId: '' }
const NBSP = String.fromCharCode(160)
const TABLE_COLUMNS = 5

/**
 * Behind AdminRoute (App.tsx). Lists every category — active AND inactive
 * — via GET /categories/admin, so a deactivated category stays
 * manageable. Create/edit (POST/PATCH /categories) plus deactivate
 * (DELETE /categories/:id) and reactivate (POST /categories/:id/
 * reactivate). The public GET /categories / GET /categories/tree stay
 * active-only, so an inactive category disappears from the storefront but
 * not from this page. The API returns a flat array; the parent/child
 * hierarchy is rebuilt client-side (sortCategoriesForDisplay).
 */
export function AdminCategoriesPage() {
  const categoriesQuery = useAdminCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const deactivateCategory = useDeactivateCategory()
  const reactivateCategory = useReactivateCategory()
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDeactivate, setPendingDeactivate] = useState<Category | null>(null)

  const statusError = deactivateCategory.isError
    ? getApiErrorMessage(deactivateCategory.error)
    : reactivateCategory.isError
      ? getApiErrorMessage(reactivateCategory.error)
      : null

  function openCreate() {
    setIsAdding(true)
    setEditingId(null)
  }

  function openEdit(id: string) {
    setEditingId(id)
    setIsAdding(false)
  }

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
      await updateCategory.mutateAsync({ id, payload: toUpdateCategoryPayload(values) })
      setEditingId(null)
    } catch {
      // Error surfaced via updateCategory.isError below.
    }
  }

  function confirmDeactivate() {
    if (!pendingDeactivate) return
    deactivateCategory.mutate(pendingDeactivate.id, {
      onSettled: () => setPendingDeactivate(null),
    })
  }

  if (categoriesQuery.isPending) {
    return <AdminPageSkeleton rows={4} />
  }

  const categories = categoriesQuery.data ?? []
  const rows = sortCategoriesForDisplay(categories)
  const parentNameById = new Map(categories.map((c) => [c.id, c.name]))
  const pendingChildCount = pendingDeactivate
    ? categories.filter((c) => c.parentCategoryId === pendingDeactivate.id).length
    : 0

  return (
    <AdminPage
      title="Categories"
      description="Every category in the catalog. Deactivated categories stay visible here for admins but are hidden from the storefront."
      actions={
        <Button
          type="button"
          variant="secondary"
          onClick={() => (isAdding ? setIsAdding(false) : openCreate())}
        >
          {isAdding ? 'Cancel' : 'New category'}
        </Button>
      }
    >
      {isAdding && (
        <AdminCard as="section" title="New category">
          <CategoryForm
            allCategories={categories}
            defaultValues={EMPTY_VALUES}
            onSubmit={(values) => void handleCreate(values)}
            isSubmitting={createCategory.isPending}
            submitError={createCategory.isError ? getApiErrorMessage(createCategory.error) : null}
            submitLabel="Create category"
          />
        </AdminCard>
      )}

      {categoriesQuery.isError && (
        <Alert variant="error">{getApiErrorMessage(categoriesQuery.error)}</Alert>
      )}

      {statusError && <Alert variant="error">{statusError}</Alert>}

      {categories.length === 0 && !isAdding ? (
        <AdminEmptyState
          title="No categories yet"
          description="Create the first category to start organising the catalog."
          action={
            <Button type="button" onClick={openCreate}>
              New category
            </Button>
          }
        />
      ) : categories.length > 0 ? (
        <div className={styles.results} aria-busy={categoriesQuery.isFetching || undefined}>
          <AdminCard flush>
            <AdminTable caption="Categories">
              <AdminTable.Head>
                <AdminTable.Row>
                  <AdminTable.HeaderCell>Name</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell>Slug</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell>Parent</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell>Status</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell>Actions</AdminTable.HeaderCell>
                </AdminTable.Row>
              </AdminTable.Head>
              <AdminTable.Body>
                {rows.map(({ category, depth }) => (
                  <Fragment key={category.id}>
                    <AdminTable.Row>
                      <AdminTable.Cell>
                        <span
                          className={styles.name}
                          data-depth={depth}
                          data-child={depth > 0 ? 'true' : undefined}
                          style={
                            depth > 0
                              ? { paddingInlineStart: `calc(var(--space-5) * ${depth})` }
                              : undefined
                          }
                        >
                          {category.name}
                        </span>
                      </AdminTable.Cell>
                      <AdminTable.Cell>
                        <span className={styles.slug}>{category.slug}</span>
                      </AdminTable.Cell>
                      <AdminTable.Cell>
                        {category.parentCategoryId
                          ? (parentNameById.get(category.parentCategoryId) ??
                            category.parentCategoryId)
                          : '—'}
                      </AdminTable.Cell>
                      <AdminTable.Cell>
                        {category.isActive ? (
                          <AdminBadge variant="success">Active</AdminBadge>
                        ) : (
                          <AdminBadge variant="neutral">Inactive</AdminBadge>
                        )}
                      </AdminTable.Cell>
                      <AdminTable.Cell>
                        <span className={styles.rowActions}>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => openEdit(category.id)}
                          >
                            Edit
                          </Button>
                          {category.isActive ? (
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => setPendingDeactivate(category)}
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
                        </span>
                      </AdminTable.Cell>
                    </AdminTable.Row>

                    {editingId === category.id && (
                      <AdminTable.Row>
                        <AdminTable.Cell colSpan={TABLE_COLUMNS}>
                          <AdminCard as="section" title="Edit category">
                            <CategoryForm
                              allCategories={categories}
                              excludeIds={
                                new Set<string>([
                                  category.id,
                                  ...getDescendantIds(category.id, categories),
                                ])
                              }
                              defaultValues={{
                                name: category.name,
                                slug: category.slug,
                                parentCategoryId: category.parentCategoryId ?? '',
                              }}
                              onSubmit={(values) => void handleUpdate(category.id, values)}
                              onCancel={() => setEditingId(null)}
                              isSubmitting={updateCategory.isPending}
                              submitError={
                                updateCategory.isError
                                  ? getApiErrorMessage(updateCategory.error)
                                  : null
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
        </div>
      ) : null}

      <Modal
        isOpen={pendingDeactivate !== null}
        onClose={() => setPendingDeactivate(null)}
        title="Deactivate category"
        size="sm"
      >
        {pendingDeactivate && (
          <div className={styles.confirm}>
            <p>
              <strong>{pendingDeactivate.name}</strong> will become inactive. It disappears from
              the storefront immediately, but stays here so you can reactivate it later.
            </p>
            {pendingChildCount > 0 && (
              <p>
                {pendingChildCount} child{' '}
                {pendingChildCount === 1 ? 'category' : 'categories'} will remain under it and are
                not deactivated.
              </p>
            )}
            <div className={styles.confirmActions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPendingDeactivate(null)}
                disabled={deactivateCategory.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                isLoading={deactivateCategory.isPending}
                onClick={confirmDeactivate}
              >
                Deactivate
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AdminPage>
  )
}

interface CategoryFormProps {
  allCategories: Category[]
  /** Edit mode: the category being edited plus its descendants, excluded
   * from the parent options so the UI can't form a cycle. */
  excludeIds?: Set<string>
  defaultValues: AdminCategoryFormValues
  onSubmit: (values: AdminCategoryFormValues) => void
  onCancel?: () => void
  isSubmitting: boolean
  submitError: string | null
  submitLabel: string
}

function CategoryForm({
  allCategories,
  excludeIds,
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitError,
  submitLabel,
}: CategoryFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminCategoryFormValues>({
    resolver: zodResolver(adminCategorySchema),
    defaultValues,
  })

  const parentOptions = sortCategoriesForDisplay(allCategories).filter(
    ({ category }) => !excludeIds?.has(category.id),
  )

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
      {submitError && <Alert variant="error">{submitError}</Alert>}
      <div className={styles.formRow}>
        <TextField label="Name" error={errors.name?.message} {...register('name')} />
        <TextField label="Slug" error={errors.slug?.message} {...register('slug')} />
        <AdminSelect
          label="Parent category"
          error={errors.parentCategoryId?.message}
          {...register('parentCategoryId')}
        >
          <option value="">None</option>
          {parentOptions.map(({ category, depth }) => (
            <option key={category.id} value={category.id}>
              {NBSP.repeat(depth * 2)}
              {depth > 0 ? '— ' : ''}
              {category.name}
              {category.isActive ? '' : ' (inactive)'}
            </option>
          ))}
        </AdminSelect>
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
