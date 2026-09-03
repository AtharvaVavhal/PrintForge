import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useCategories } from '@/hooks/useCategories'
import { useAdminProduct } from '@/hooks/useAdminProduct'
import { useCreateProduct } from '@/hooks/useCreateProduct'
import { useUpdateProduct } from '@/hooks/useUpdateProduct'
import { useDeactivateProduct } from '@/hooks/useDeactivateProduct'
import { useReactivateProduct } from '@/hooks/useReactivateProduct'
import { ProductForm } from '@/features/admin/ProductForm'
import { VariantManager } from '@/features/admin/VariantManager'
import { CustomizationFieldManager } from '@/features/admin/CustomizationFieldManager'
import { ProductImageManager } from '@/features/admin/ProductImageManager'
import { ProductReviewModeration } from '@/features/admin/ProductReviewModeration'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { AdminPage } from '@/components/admin/AdminPage'
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminBadge } from '@/components/admin/AdminBadge'
import { AdminPageSkeleton } from '@/components/admin/AdminPageSkeleton'
import { getApiErrorMessage } from '@/utils/apiError'
import { formatPrice } from '@/utils/formatPrice'
import { formatDate } from '@/utils/formatDate'
import { adminProductDetailPath, ROUTES } from '@/constants/routes'
import { toCreateProductPayload, type AdminProductFormValues } from '@/schemas/adminProduct.schema'
import type { Category, Product } from '@/types/catalog'
import styles from './AdminProductDetailPage.module.css'

const NEW_PRODUCT_ID = 'new'

const EMPTY_FORM_VALUES: AdminProductFormValues = {
  categoryId: '',
  name: '',
  slug: '',
  basePrice: '',
  minQuantity: '1',
  maxQuantity: '',
  specifications: '',
}

function toFormValues(product: Product): AdminProductFormValues {
  return {
    categoryId: product.categoryId,
    name: product.name,
    slug: product.slug,
    basePrice: product.basePrice,
    minQuantity: String(product.minQuantity),
    maxQuantity: product.maxQuantity === null ? '' : String(product.maxQuantity),
    specifications: product.specifications ? JSON.stringify(product.specifications) : '',
  }
}

function categoryName(categoryId: string, categories: Category[] | undefined): string {
  return categories?.find((c) => c.id === categoryId)?.name ?? 'Category unavailable'
}

interface LocationState {
  product?: Product
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <AdminBadge variant="success">Active</AdminBadge>
  ) : (
    <AdminBadge variant="neutral">Inactive</AdminBadge>
  )
}

/**
 * Behind AdminRoute (App.tsx). `/admin/products/new` is create mode. For
 * an existing product this page prefers the full Product handed over via
 * router `state` from the products list, and falls back to GET
 * /products/admin/:id (admin-only, NOT isActive-filtered) on a direct
 * visit / refresh.
 *
 * Local `product` state is the single source of truth once loaded — each
 * sub-manager (VariantManager etc.) patches it from its own mutation's
 * response, never from a refetch. Base fields, variants, customization
 * fields, images, and review moderation are each their own
 * endpoint/section; this page only composes them.
 */
export function AdminProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const categoriesQuery = useCategories()

  const isCreating = id === NEW_PRODUCT_ID
  const stateProduct = (location.state as LocationState | null)?.product
  const [product, setProduct] = useState<Product | null>(
    !isCreating && stateProduct && stateProduct.id === id ? stateProduct : null,
  )
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  const adminProductQuery = useAdminProduct(!isCreating && !product ? id : undefined)
  if (!isCreating && !product && adminProductQuery.data) {
    setProduct(adminProductQuery.data)
  }

  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct(product?.id ?? '')
  const deactivateProduct = useDeactivateProduct(product?.id ?? '')
  const reactivateProduct = useReactivateProduct(product?.id ?? '')

  async function handleCreate(values: AdminProductFormValues) {
    try {
      const created = await createProduct.mutateAsync(toCreateProductPayload(values))
      void navigate(adminProductDetailPath(created.id), { replace: true, state: { product: created } })
    } catch {
      // Error surfaced via createProduct.isError below.
    }
  }

  async function handleUpdate(values: AdminProductFormValues) {
    if (!product) return
    try {
      const updated = await updateProduct.mutateAsync(toCreateProductPayload(values))
      setProduct(updated)
    } catch {
      // Error surfaced via updateProduct.isError below.
    }
  }

  async function handleDeactivate() {
    if (!product) return
    try {
      await deactivateProduct.mutateAsync()
      setProduct((prev) => (prev ? { ...prev, isActive: false } : prev))
    } catch {
      // Error surfaced via deactivateProduct.isError below.
    } finally {
      setConfirmDeactivate(false)
    }
  }

  async function handleReactivate() {
    if (!product) return
    try {
      await reactivateProduct.mutateAsync()
      setProduct((prev) => (prev ? { ...prev, isActive: true } : prev))
    } catch {
      // Error surfaced via reactivateProduct.isError below.
    }
  }

  // ─── Create mode ───────────────────────────────────────────────────────
  if (isCreating) {
    if (categoriesQuery.isPending) {
      return <AdminPageSkeleton rows={4} />
    }
    return (
      <AdminPage
        title="New product"
        breadcrumbs={[
          { label: 'Products', to: ROUTES.ADMIN_PRODUCTS },
          { label: 'New product' },
        ]}
      >
        {categoriesQuery.isError ? (
          <Alert variant="error">{getApiErrorMessage(categoriesQuery.error)}</Alert>
        ) : (
          <AdminCard as="section" title="Product details">
            <ProductForm
              categories={categoriesQuery.data}
              defaultValues={EMPTY_FORM_VALUES}
              isSubmitting={createProduct.isPending}
              submitError={createProduct.isError ? getApiErrorMessage(createProduct.error) : null}
              submitLabel="Create product"
              onSubmit={(values) => void handleCreate(values)}
            />
          </AdminCard>
        )}
      </AdminPage>
    )
  }

  // ─── Loading / not found ───────────────────────────────────────────────
  if (!product) {
    if (adminProductQuery.isPending) {
      return <AdminPageSkeleton rows={5} />
    }
    return (
      <AdminPage
        title="Product"
        breadcrumbs={[{ label: 'Products', to: ROUTES.ADMIN_PRODUCTS }, { label: 'Product' }]}
      >
        <Alert variant="error">
          {adminProductQuery.isError
            ? getApiErrorMessage(adminProductQuery.error)
            : 'This product could not be found.'}
        </Alert>
        <p>
          <Link to={ROUTES.ADMIN_PRODUCTS} className={styles.backLink}>
            Back to products
          </Link>
        </p>
      </AdminPage>
    )
  }

  // ─── Edit mode ─────────────────────────────────────────────────────────
  const specEntries = product.specifications ? Object.entries(product.specifications) : []

  return (
    <AdminPage
      breadcrumbs={[
        { label: 'Products', to: ROUTES.ADMIN_PRODUCTS },
        { label: product.name },
      ]}
      title={product.name}
      description={`Slug: ${product.slug}`}
      actions={
        <>
          <StatusBadge isActive={product.isActive} />
          {product.isActive ? (
            <Button
              type="button"
              variant="secondary"
              isLoading={deactivateProduct.isPending}
              onClick={() => setConfirmDeactivate(true)}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              type="button"
              isLoading={reactivateProduct.isPending}
              onClick={() => void handleReactivate()}
            >
              Reactivate
            </Button>
          )}
        </>
      }
    >
      {deactivateProduct.isError && (
        <Alert variant="error">{getApiErrorMessage(deactivateProduct.error)}</Alert>
      )}
      {reactivateProduct.isError && (
        <Alert variant="error">{getApiErrorMessage(reactivateProduct.error)}</Alert>
      )}
      {!product.isActive && !reactivateProduct.isError && (
        <Alert variant="info">
          This product is deactivated and hidden from the storefront. It still appears in the admin
          products list (filter by “Inactive only”) and can be reactivated from there or here.
        </Alert>
      )}

      <AdminCard as="section" title="Product information">
        <dl className={styles.info}>
          <div className={styles.infoRow}>
            <dt>Category</dt>
            <dd>{categoryName(product.categoryId, categoriesQuery.data)}</dd>
          </div>
          <div className={styles.infoRow}>
            <dt>Base price</dt>
            <dd>{formatPrice(product.basePrice)}</dd>
          </div>
          <div className={styles.infoRow}>
            <dt>Minimum quantity</dt>
            <dd>{product.minQuantity}</dd>
          </div>
          <div className={styles.infoRow}>
            <dt>Maximum quantity</dt>
            <dd>{product.maxQuantity ?? 'No limit'}</dd>
          </div>
          <div className={styles.infoRow}>
            <dt>Rating</dt>
            <dd>
              {product.avgRating !== null
                ? `${product.avgRating} · ${product.reviewCount} ${product.reviewCount === 1 ? 'review' : 'reviews'}`
                : 'No reviews yet'}
            </dd>
          </div>
          <div className={styles.infoRow}>
            <dt>Created</dt>
            <dd>{formatDate(product.createdAt)}</dd>
          </div>
          <div className={styles.infoRow}>
            <dt>Specifications</dt>
            <dd>
              {specEntries.length === 0 ? (
                <span className={styles.muted}>None</span>
              ) : (
                <ul className={styles.specList}>
                  {specEntries.map(([key, value]) => (
                    <li key={key}>
                      <span className={styles.specKey}>{key}</span>: {String(value)}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard as="section" title="Product details">
        {categoriesQuery.isError ? (
          <Alert variant="error">{getApiErrorMessage(categoriesQuery.error)}</Alert>
        ) : categoriesQuery.data ? (
          <ProductForm
            categories={categoriesQuery.data}
            defaultValues={toFormValues(product)}
            isSubmitting={updateProduct.isPending}
            submitError={updateProduct.isError ? getApiErrorMessage(updateProduct.error) : null}
            submitLabel="Save changes"
            onSubmit={(values) => void handleUpdate(values)}
          />
        ) : null}
      </AdminCard>

      <VariantManager
        productId={product.id}
        variants={product.variants}
        onVariantsChange={(variants) => setProduct((prev) => (prev ? { ...prev, variants } : prev))}
      />

      <CustomizationFieldManager
        productId={product.id}
        fields={product.customizationFields}
        onFieldsChange={(customizationFields) =>
          setProduct((prev) => (prev ? { ...prev, customizationFields } : prev))
        }
      />

      <ProductImageManager
        productId={product.id}
        images={product.images}
        onImagesChange={(images) => setProduct((prev) => (prev ? { ...prev, images } : prev))}
      />

      <ProductReviewModeration productId={product.id} />

      <Modal
        isOpen={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        title="Deactivate this product?"
        size="sm"
      >
        <div className={styles.confirm}>
          <p>
            It will be hidden from the storefront immediately. It stays in the admin catalog (filter
            “Inactive only”) and you can reactivate it at any time.
          </p>
          <div className={styles.confirmActions}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmDeactivate(false)}
              disabled={deactivateProduct.isPending}
            >
              Keep active
            </Button>
            <Button
              type="button"
              isLoading={deactivateProduct.isPending}
              onClick={() => void handleDeactivate()}
            >
              Deactivate
            </Button>
          </div>
        </div>
      </Modal>
    </AdminPage>
  )
}
