import { Fragment, useState } from 'react'
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
import { Modal } from '@/components/ui/Modal'
import { TextField } from '@/components/ui/TextField'
import { AdminPage } from '@/components/admin/AdminPage'
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminTable } from '@/components/admin/AdminTable'
import { AdminSelect } from '@/components/admin/AdminSelect'
import { AdminBadge } from '@/components/admin/AdminBadge'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { AdminPageSkeleton } from '@/components/admin/AdminPageSkeleton'
import { getApiErrorMessage } from '@/utils/apiError'
import { formatPrice } from '@/utils/formatPrice'
import { formatDate } from '@/utils/formatDate'
import type { Category } from '@/types/catalog'
import type { CouponType, CouponView } from '@/types/coupons'
import { deriveCouponStatus } from './couponStatus'
import styles from './AdminCouponsPage.module.css'

const DEFAULT_LIMIT = 20
const TABLE_COLUMNS = 8

const COUPON_TYPE_VALUES: CouponType[] = ['PERCENTAGE', 'FLAT_AMOUNT', 'FREE_SHIPPING']

function parseCouponType(value: string | null): CouponType | undefined {
  return value && (COUPON_TYPE_VALUES as string[]).includes(value) ? (value as CouponType) : undefined
}

function parseStatus(value: string | null): boolean | undefined {
  if (value === 'active') return true
  if (value === 'inactive') return false
  return undefined
}

function couponDiscountLabel(coupon: CouponView): string {
  switch (coupon.type) {
    case 'PERCENTAGE':
      return coupon.percentageOff !== null ? `${coupon.percentageOff}% off` : '—'
    case 'FLAT_AMOUNT':
      return coupon.flatAmountOff !== null ? `${formatPrice(coupon.flatAmountOff)} off` : '—'
    case 'FREE_SHIPPING':
      return 'Free shipping'
  }
}

function couponScopeLabel(coupon: CouponView, categories: Category[] | undefined): string {
  if (coupon.scopeType === 'STORE_WIDE') return 'Store-wide'
  const category = categories?.find((c) => c.id === coupon.categoryId)
  return category ? category.name : 'Category (inactive/unknown)'
}

function couponUsageTotalLabel(coupon: CouponView): string {
  const total = coupon.usageLimitTotal === null ? '∞' : String(coupon.usageLimitTotal)
  return `${coupon.usedCount} / ${total}`
}

function couponValidityLabel(coupon: CouponView): string {
  if (coupon.startsAt === null && coupon.expiresAt === null) return 'Always'
  const start = coupon.startsAt ? formatDate(coupon.startsAt) : '—'
  const end = coupon.expiresAt ? formatDate(coupon.expiresAt) : '—'
  return `${start} – ${end}`
}

/** `<input type="date">` needs "YYYY-MM-DD" — the backend returns a full
 * ISO datetime string, so slice rather than assume the format matches. */
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
 * Behind AdminRoute (App.tsx). Data-dense AdminTable + inline create/edit
 * AdminCard forms, matching the Orders/Customers/Products/Categories
 * redesigns. GET /admin/coupons is genuinely paginated and accepts
 * isActive/type filters (ListAdminCouponsQueryDto) — no code search, no
 * date/category filters exist server-side, so none are offered.
 *
 * code/type/percentageOff/flatAmountOff/scopeType/categoryId are the
 * coupon's fixed identity, immutable after creation (backend whitelist) —
 * the edit form never renders them. "Expired"/"Scheduled" are derived
 * presentation states only; the backend never auto-flips isActive.
 */
export function AdminCouponsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Number(searchParams.get('page') ?? '1')
  const isActive = parseStatus(searchParams.get('status'))
  const type = parseCouponType(searchParams.get('type'))

  const categoriesQuery = useCategories()
  const couponsQuery = useAdminCoupons({ page, limit: DEFAULT_LIMIT, isActive, type })
  const createCoupon = useCreateCoupon()
  const updateCoupon = useUpdateCoupon()

  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDeactivate, setPendingDeactivate] = useState<CouponView | null>(null)

  const statusError = updateCoupon.isError ? getApiErrorMessage(updateCoupon.error) : null
  const hasActiveFilters = isActive !== undefined || type !== undefined

  function setFilter(key: 'status' | 'type', value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) {
        next.set(key, value)
      } else {
        next.delete(key)
      }
      next.set('page', '1')
      return next
    })
  }

  function clearFilters() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('status')
      next.delete('type')
      next.set('page', '1')
      return next
    })
  }

  function goToPage(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('page', String(nextPage))
      return next
    })
  }

  function openCreate() {
    setIsAdding(true)
    setEditingId(null)
  }

  function openEdit(id: string) {
    setEditingId(id)
    setIsAdding(false)
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
      // Error surfaced via statusError / the edit form's own Alert.
    }
  }

  function confirmDeactivate() {
    if (!pendingDeactivate) return
    updateCoupon.mutate(
      { id: pendingDeactivate.id, payload: { isActive: false } },
      { onSettled: () => setPendingDeactivate(null) },
    )
  }

  function activate(id: string) {
    updateCoupon.mutate({ id, payload: { isActive: true } })
  }

  if (couponsQuery.isPending) {
    return <AdminPageSkeleton rows={4} />
  }

  const data = couponsQuery.data
  const coupons = data?.items ?? []
  const editSubmitError =
    editingId && updateCoupon.isError ? getApiErrorMessage(updateCoupon.error) : null

  return (
    <AdminPage
      title="Coupons"
      description="Promotional discount codes customers enter at checkout. Inactive, expired, or fully-redeemed coupons stay listed here but won't apply."
      actions={
        <Button
          type="button"
          variant="secondary"
          onClick={() => (isAdding ? setIsAdding(false) : openCreate())}
        >
          {isAdding ? 'Cancel' : 'New coupon'}
        </Button>
      }
    >
      {isAdding && categoriesQuery.data && (
        <AdminCard as="section" title="New coupon">
          <CreateCouponFormFields
            categories={categoriesQuery.data}
            onSubmit={(values) => void handleCreate(values)}
            isSubmitting={createCoupon.isPending}
            submitError={createCoupon.isError ? getApiErrorMessage(createCoupon.error) : null}
          />
        </AdminCard>
      )}

      <AdminCard as="section" title="Filters">
        <div className={styles.filters}>
          <AdminSelect
            label="Status"
            name="status"
            value={searchParams.get('status') ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </AdminSelect>

          <AdminSelect
            label="Type"
            name="type"
            value={type ?? ''}
            onChange={(event) => setFilter('type', event.target.value)}
          >
            <option value="">All types</option>
            <option value="PERCENTAGE">Percentage</option>
            <option value="FLAT_AMOUNT">Flat amount</option>
            <option value="FREE_SHIPPING">Free shipping</option>
          </AdminSelect>

          {hasActiveFilters && (
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </AdminCard>

      {couponsQuery.isError && (
        <Alert variant="error">{getApiErrorMessage(couponsQuery.error)}</Alert>
      )}

      {statusError && !editingId && <Alert variant="error">{statusError}</Alert>}

      {data && coupons.length === 0 && !isAdding ? (
        <AdminEmptyState
          title="No coupons yet"
          description={
            hasActiveFilters
              ? 'No coupons match these filters.'
              : 'Create a discount code for customers to use at checkout.'
          }
          action={
            hasActiveFilters ? (
              <Button type="button" variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button type="button" onClick={openCreate}>
                New coupon
              </Button>
            )
          }
        />
      ) : data && coupons.length > 0 ? (
        <div className={styles.results} aria-busy={couponsQuery.isFetching || undefined}>
          <AdminCard flush>
            <AdminTable caption="Coupons">
              <AdminTable.Head>
                <AdminTable.Row>
                  <AdminTable.HeaderCell>Code</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell>Discount</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell>Scope</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell align="end">Min order</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell>Usage</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell>Validity</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell>Status</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell>Actions</AdminTable.HeaderCell>
                </AdminTable.Row>
              </AdminTable.Head>
              <AdminTable.Body>
                {coupons.map((coupon) => {
                  const status = deriveCouponStatus(coupon)
                  return (
                    <Fragment key={coupon.id}>
                      <AdminTable.Row>
                        <AdminTable.Cell>
                          <span className={styles.codeCell}>
                            <span className={styles.code}>{coupon.code}</span>
                            {coupon.description && (
                              <span className={styles.description}>{coupon.description}</span>
                            )}
                            {coupon.firstOrderOnly && (
                              <span className={styles.marker}>First order only</span>
                            )}
                          </span>
                        </AdminTable.Cell>
                        <AdminTable.Cell>{couponDiscountLabel(coupon)}</AdminTable.Cell>
                        <AdminTable.Cell>
                          {couponScopeLabel(coupon, categoriesQuery.data)}
                        </AdminTable.Cell>
                        <AdminTable.Cell align="end">
                          {coupon.minOrderValue !== null ? formatPrice(coupon.minOrderValue) : '—'}
                        </AdminTable.Cell>
                        <AdminTable.Cell>
                          <span className={styles.usageCell}>
                            <span>{couponUsageTotalLabel(coupon)}</span>
                            {coupon.usageLimitPerUser !== null && (
                              <span className={styles.usageSub}>
                                {coupon.usageLimitPerUser} per user
                              </span>
                            )}
                          </span>
                        </AdminTable.Cell>
                        <AdminTable.Cell>
                          <span className={styles.validity}>{couponValidityLabel(coupon)}</span>
                        </AdminTable.Cell>
                        <AdminTable.Cell>
                          <AdminBadge variant={status.variant}>{status.label}</AdminBadge>
                        </AdminTable.Cell>
                        <AdminTable.Cell>
                          <span className={styles.rowActions}>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => openEdit(coupon.id)}
                            >
                              Edit
                            </Button>
                            {coupon.isActive ? (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setPendingDeactivate(coupon)}
                              >
                                Deactivate
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                isLoading={
                                  updateCoupon.isPending &&
                                  updateCoupon.variables?.id === coupon.id
                                }
                                onClick={() => activate(coupon.id)}
                              >
                                Activate
                              </Button>
                            )}
                          </span>
                        </AdminTable.Cell>
                      </AdminTable.Row>

                      {editingId === coupon.id && (
                        <AdminTable.Row>
                          <AdminTable.Cell colSpan={TABLE_COLUMNS}>
                            <AdminCard as="section" title="Edit coupon">
                              <EditCouponFormFields
                                defaultValues={toEditFormValues(coupon)}
                                onSubmit={(values) => void handleUpdate(coupon.id, values)}
                                onCancel={() => setEditingId(null)}
                                isSubmitting={updateCoupon.isPending}
                                submitError={editSubmitError}
                              />
                            </AdminCard>
                          </AdminTable.Cell>
                        </AdminTable.Row>
                      )}
                    </Fragment>
                  )
                })}
              </AdminTable.Body>
            </AdminTable>
          </AdminCard>

          <AdminPagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            onPageChange={goToPage}
            label="Coupons pagination"
          />
        </div>
      ) : null}

      <Modal
        isOpen={pendingDeactivate !== null}
        onClose={() => setPendingDeactivate(null)}
        title="Deactivate coupon"
        size="sm"
      >
        {pendingDeactivate && (
          <div className={styles.confirm}>
            <p>
              <strong>{pendingDeactivate.code}</strong> will stop working at checkout immediately.
              Orders that already used it are unaffected, and you can activate it again later.
            </p>
            <div className={styles.confirmActions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPendingDeactivate(null)}
                disabled={updateCoupon.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                isLoading={updateCoupon.isPending}
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

        <AdminSelect label="Type" error={errors.type?.message} {...register('type')}>
          <option value="PERCENTAGE">Percentage off</option>
          <option value="FLAT_AMOUNT">Flat amount off</option>
          <option value="FREE_SHIPPING">Free shipping</option>
        </AdminSelect>

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
        <AdminSelect label="Scope" error={errors.scopeType?.message} {...register('scopeType')}>
          <option value="STORE_WIDE">Store-wide</option>
          <option value="CATEGORY">Specific category</option>
        </AdminSelect>

        {scopeType === 'CATEGORY' && (
          <AdminSelect
            label="Category"
            error={errors.categoryId?.message}
            {...register('categoryId')}
          >
            <option value="">Select a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </AdminSelect>
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
