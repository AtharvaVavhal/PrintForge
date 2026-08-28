import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCategories } from '@/hooks/useCategories'
import { useAdminCoupons } from '@/hooks/useAdminCoupons'
import { useCreateCoupon } from '@/hooks/useCreateCoupon'
import { useUpdateCoupon } from '@/hooks/useUpdateCoupon'
import {
  createCouponSchema,
  editCouponSchema,
  EMPTY_CREATE_COUPON_VALUES,
  toCreateCouponPayload,
  toUpdateCouponPayload,
  type CreateCouponFormValues,
  type EditCouponFormValues,
} from '@/schemas/coupon.schema'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { TextField } from '@/components/ui/TextField'
import { getApiErrorMessage } from '@/utils/apiError'
import { formatPrice } from '@/utils/formatPrice'
import type { Category } from '@/types/catalog'
import type { CouponView } from '@/types/coupons'
import styles from './AdminCouponsPage.module.css'

const DEFAULT_LIMIT = 20

function couponTypeSummary(coupon: CouponView): string {
  switch (coupon.type) {
    case 'PERCENTAGE':
      return `${coupon.percentageOff ?? '?'}% off`
    case 'FLAT_AMOUNT':
      return `${formatPrice(coupon.flatAmountOff ?? '0')} off`
    case 'FREE_SHIPPING':
      return 'Free shipping'
  }
}

function couponScopeSummary(coupon: CouponView, categories: Category[] | undefined): string {
  if (coupon.scopeType === 'STORE_WIDE') return 'Store-wide'
  const category = categories?.find((c) => c.id === coupon.categoryId)
  return category ? `Category: ${category.name}` : 'Category-scoped'
}

/** `<input type="date">` needs "YYYY-MM-DD" — the backend returns a full
 * ISO datetime string (Date's own JSON serialization), so this slices it
 * down rather than assuming the format matches. */
function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

function toEditFormValues(coupon: CouponView): EditCouponFormValues {
  return {
    minOrderValue: coupon.minOrderValue ?? '',
    usageLimitTotal: coupon.usageLimitTotal === null ? '' : String(coupon.usageLimitTotal),
    usageLimitPerUser: coupon.usageLimitPerUser === null ? '' : String(coupon.usageLimitPerUser),
    firstOrderOnly: coupon.firstOrderOnly,
    startsAt: toDateInputValue(coupon.startsAt),
    expiresAt: toDateInputValue(coupon.expiresAt),
    isActive: coupon.isActive,
    description: coupon.description ?? '',
  }
}

/**
 * Behind AdminRoute (App.tsx). List + inline create/edit forms, same shape
 * as AdminCategoriesPage — GET /admin/coupons/:id genuinely exists (unlike
 * products), but there's no need for a separate detail fetch since every
 * field needed for the edit form is already on the list row.
 *
 * code/type/percentageOff/flatAmountOff/scopeType/categoryId are the
 * coupon's fixed identity, immutable after creation (backend rejects them
 * on PATCH via UpdateCouponDto's whitelist) — the edit form
 * (EditCouponFormFields) simply never renders fields for them, rather than
 * rendering-then-disabling.
 */
export function AdminCouponsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Number(searchParams.get('page') ?? '1')
  const categoriesQuery = useCategories()
  const couponsQuery = useAdminCoupons({ page, limit: DEFAULT_LIMIT })
  const createCoupon = useCreateCoupon()
  const updateCoupon = useUpdateCoupon()
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  function goToPage(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('page', String(nextPage))
      return next
    })
  }

  async function handleCreate(values: CreateCouponFormValues) {
    try {
      await createCoupon.mutateAsync(toCreateCouponPayload(values))
      setIsAdding(false)
    } catch {
      // Error surfaced via createCoupon.isError below.
    }
  }

  async function handleUpdate(id: string, values: EditCouponFormValues) {
    try {
      await updateCoupon.mutateAsync({ id, payload: toUpdateCouponPayload(values) })
      setEditingId(null)
    } catch {
      // Error surfaced via updateCoupon.isError below.
    }
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <h1>Coupons</h1>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setIsAdding((prev) => !prev)
            setEditingId(null)
          }}
        >
          {isAdding ? 'Cancel' : 'New coupon'}
        </Button>
      </div>

      {couponsQuery.isPending && <Skeleton className={styles.skeletonBlock} />}

      {couponsQuery.isError && <Alert variant="error">{getApiErrorMessage(couponsQuery.error)}</Alert>}

      {couponsQuery.data && couponsQuery.data.items.length === 0 && !isAdding && (
        <p className={styles.empty}>No coupons yet.</p>
      )}

      {couponsQuery.data && couponsQuery.data.items.length > 0 && (
        <ul className={styles.list}>
          {couponsQuery.data.items.map((coupon) =>
            editingId === coupon.id ? (
              <li key={coupon.id} className={styles.row}>
                <EditCouponFormFields
                  defaultValues={toEditFormValues(coupon)}
                  onSubmit={(values) => void handleUpdate(coupon.id, values)}
                  onCancel={() => setEditingId(null)}
                  isSubmitting={updateCoupon.isPending}
                  submitError={updateCoupon.isError ? getApiErrorMessage(updateCoupon.error) : null}
                />
              </li>
            ) : (
              <li key={coupon.id} className={styles.row}>
                <div className={styles.summary}>
                  <span className={styles.code}>{coupon.code}</span>
                  <span className={styles.meta}>{couponTypeSummary(coupon)}</span>
                  <span className={styles.meta}>{couponScopeSummary(coupon, categoriesQuery.data)}</span>
                  <span className={styles.meta}>
                    Used {coupon.usedCount}
                    {coupon.usageLimitTotal !== null ? ` / ${coupon.usageLimitTotal}` : ''}
                  </span>
                  {!coupon.isActive && <span className={styles.inactiveFlag}>Inactive</span>}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditingId(coupon.id)
                    setIsAdding(false)
                  }}
                >
                  Edit
                </Button>
              </li>
            ),
          )}
        </ul>
      )}

      {couponsQuery.data && couponsQuery.data.meta.totalPages > 1 && (
        <div className={styles.pagination}>
          <Button variant="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
            Previous
          </Button>
          <span className={styles.pageIndicator}>
            Page {couponsQuery.data.meta.page} of {couponsQuery.data.meta.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= couponsQuery.data.meta.totalPages}
            onClick={() => goToPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {isAdding && categoriesQuery.data && (
        <div className={styles.addForm}>
          <CreateCouponFormFields
            categories={categoriesQuery.data}
            onSubmit={(values) => void handleCreate(values)}
            isSubmitting={createCoupon.isPending}
            submitError={createCoupon.isError ? getApiErrorMessage(createCoupon.error) : null}
          />
        </div>
      )}
    </section>
  )
}

interface CreateCouponFormFieldsProps {
  categories: Category[]
  onSubmit: (values: CreateCouponFormValues) => void
  isSubmitting: boolean
  submitError: string | null
}

function CreateCouponFormFields({
  categories,
  onSubmit,
  isSubmitting,
  submitError,
}: CreateCouponFormFieldsProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateCouponFormValues>({
    resolver: zodResolver(createCouponSchema),
    defaultValues: EMPTY_CREATE_COUPON_VALUES,
  })

  const type = useWatch({ control, name: 'type', defaultValue: EMPTY_CREATE_COUPON_VALUES.type })
  const scopeType = useWatch({
    control,
    name: 'scopeType',
    defaultValue: EMPTY_CREATE_COUPON_VALUES.scopeType,
  })

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
      {submitError && <Alert variant="error">{submitError}</Alert>}

      <div className={styles.formRow}>
        <TextField label="Code" error={errors.code?.message} {...register('code')} />

        <div className={styles.selectField}>
          <label htmlFor="coupon-type" className={styles.selectLabel}>
            Type
          </label>
          <select id="coupon-type" className={styles.select} {...register('type')}>
            <option value="PERCENTAGE">Percentage off</option>
            <option value="FLAT_AMOUNT">Flat amount off</option>
            <option value="FREE_SHIPPING">Free shipping</option>
          </select>
        </div>

        {type === 'PERCENTAGE' && (
          <TextField
            label="Percentage off (1-100)"
            type="number"
            error={errors.percentageOff?.message}
            {...register('percentageOff')}
          />
        )}
        {type === 'FLAT_AMOUNT' && (
          <TextField
            label="Flat amount off"
            type="number"
            step="0.01"
            error={errors.flatAmountOff?.message}
            {...register('flatAmountOff')}
          />
        )}
      </div>

      <div className={styles.formRow}>
        <div className={styles.selectField}>
          <label htmlFor="coupon-scope" className={styles.selectLabel}>
            Scope
          </label>
          <select id="coupon-scope" className={styles.select} {...register('scopeType')}>
            <option value="STORE_WIDE">Store-wide</option>
            <option value="CATEGORY">Specific category</option>
          </select>
        </div>

        {scopeType === 'CATEGORY' && (
          <div className={styles.selectField}>
            <label htmlFor="coupon-category" className={styles.selectLabel}>
              Category
            </label>
            <select id="coupon-category" className={styles.select} {...register('categoryId')}>
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <p className={styles.error} role="alert">
                {errors.categoryId.message}
              </p>
            )}
          </div>
        )}
      </div>

      <div className={styles.formRow}>
        <TextField
          label="Minimum order value (optional)"
          type="number"
          step="0.01"
          error={errors.minOrderValue?.message}
          {...register('minOrderValue')}
        />
        <TextField
          label="Total usage limit (optional)"
          type="number"
          error={errors.usageLimitTotal?.message}
          {...register('usageLimitTotal')}
        />
        <TextField
          label="Per-user usage limit (optional, default 1)"
          type="number"
          error={errors.usageLimitPerUser?.message}
          {...register('usageLimitPerUser')}
        />
      </div>

      <div className={styles.formRow}>
        <TextField
          label="Starts at (optional)"
          type="date"
          error={errors.startsAt?.message}
          {...register('startsAt')}
        />
        <TextField
          label="Expires at (optional)"
          type="date"
          error={errors.expiresAt?.message}
          {...register('expiresAt')}
        />
        <label className={styles.checkboxLabel}>
          <input type="checkbox" {...register('firstOrderOnly')} />
          First order only
        </label>
      </div>

      <div className={styles.formRow}>
        <TextField
          label="Description (optional, admin-internal)"
          error={errors.description?.message}
          {...register('description')}
        />
      </div>

      <div className={styles.formActions}>
        <Button type="submit" isLoading={isSubmitting}>
          Create coupon
        </Button>
      </div>
    </form>
  )
}

interface EditCouponFormFieldsProps {
  defaultValues: EditCouponFormValues
  onSubmit: (values: EditCouponFormValues) => void
  onCancel: () => void
  isSubmitting: boolean
  submitError: string | null
}

function EditCouponFormFields({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitError,
}: EditCouponFormFieldsProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditCouponFormValues>({
    resolver: zodResolver(editCouponSchema),
    defaultValues,
  })

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
      {submitError && <Alert variant="error">{submitError}</Alert>}

      <div className={styles.formRow}>
        <TextField
          label="Minimum order value (optional)"
          type="number"
          step="0.01"
          error={errors.minOrderValue?.message}
          {...register('minOrderValue')}
        />
        <TextField
          label="Total usage limit (optional)"
          type="number"
          error={errors.usageLimitTotal?.message}
          {...register('usageLimitTotal')}
        />
        <TextField
          label="Per-user usage limit (optional)"
          type="number"
          error={errors.usageLimitPerUser?.message}
          {...register('usageLimitPerUser')}
        />
      </div>

      <div className={styles.formRow}>
        <TextField
          label="Starts at (optional)"
          type="date"
          error={errors.startsAt?.message}
          {...register('startsAt')}
        />
        <TextField
          label="Expires at (optional)"
          type="date"
          error={errors.expiresAt?.message}
          {...register('expiresAt')}
        />
        <label className={styles.checkboxLabel}>
          <input type="checkbox" {...register('firstOrderOnly')} />
          First order only
        </label>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" {...register('isActive')} />
          Active
        </label>
      </div>

      <div className={styles.formRow}>
        <TextField
          label="Description (optional, admin-internal)"
          error={errors.description?.message}
          {...register('description')}
        />
      </div>

      <div className={styles.formActions}>
        <Button type="submit" isLoading={isSubmitting}>
          Save
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
