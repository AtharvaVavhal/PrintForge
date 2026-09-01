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
import { Skeleton } from '@/components/ui/Skeleton'
import { getApiErrorMessage } from '@/utils/apiError'
import { adminProductDetailPath, ROUTES } from '@/constants/routes'
import { toCreateProductPayload, type AdminProductFormValues } from '@/schemas/adminProduct.schema'
import type { Product } from '@/types/catalog'
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

interface LocationState {
  product?: Product
}

/**
 * Behind AdminRoute (App.tsx). `/admin/products/new` (the literal ":id"
 * value "new") is create mode. For an existing product this page prefers
 * the full Product object handed over via router `state` from
 * AdminProductRow's click (no extra request needed), and falls back to
 * GET /products/admin/:id (Phase 13.2 — admin-only, NOT isActive-
 * filtered) on a direct visit or a page refresh.
 *
 * Local component state (`product`) is the single source of truth for
 * this page once loaded — each sub-manager (VariantManager etc.) patches
 * it from its own mutation's response, never from a refetch.
 *
 * Reactivating a deactivated product (POST /products/:id/reactivate) is
 * reachable both here (right after deactivating) and by re-opening the
 * product from AdminProductsPage, which now lists inactive products too
 * (GET /products/admin). The public GET /products stays isActive-filtered,
 * so the storefront never shows a deactivated product.
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

  // Direct visit / refresh with no router state: fetch by id via the
  // admin-only GET /products/admin/:id (Phase 13.2). Not isActive-
  // filtered, so a deactivated product loads here too — the reactivation
  // dead-end is gone. Disabled once `product` is populated.
  const adminProductQuery = useAdminProduct(
    !isCreating && !product ? id : undefined,
  )
  // Adopt the fetched product into local state (the page's single source
  // of truth once loaded — sub-managers patch it). Guarded set during
  // render, per the React "you might not need an effect" guidance.
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
      // Stay on the page. The product also remains in the admin products
      // list (GET /products/admin returns inactive rows), so it's still
      // reachable later — but reactivating right here is the common case.
      setProduct((prev) => (prev ? { ...prev, isActive: false } : prev))
    } catch {
      // Error surfaced via deactivateProduct.isError below.
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

  if (isCreating) {
    return (
      <section className={styles.wrap}>
        <h1>New product</h1>
        {categoriesQuery.data && (
          <ProductForm
            categories={categoriesQuery.data}
            defaultValues={EMPTY_FORM_VALUES}
            isSubmitting={createProduct.isPending}
            submitError={createProduct.isError ? getApiErrorMessage(createProduct.error) : null}
            submitLabel="Create product"
            onSubmit={(values) => void handleCreate(values)}
          />
        )}
      </section>
    )
  }

  if (!product) {
    return (
      <section className={styles.wrap}>
        <h1>Product</h1>
        {adminProductQuery.isPending && <Skeleton className={styles.skeletonBlock} />}
        {!adminProductQuery.isPending && (
          <>
            <Alert variant="error">
              {adminProductQuery.isError
                ? getApiErrorMessage(adminProductQuery.error)
                : 'This product could not be found.'}
            </Alert>
            <p>
              <Link to={ROUTES.ADMIN_PRODUCTS}>Back to products</Link>
            </p>
          </>
        )}
      </section>
    )
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <h1>{product.name}</h1>
        {!product.isActive && <span className={styles.inactiveFlag}>Inactive</span>}
        {product.isActive ? (
          <Button
            type="button"
            variant="secondary"
            isLoading={deactivateProduct.isPending}
            onClick={() => void handleDeactivate()}
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
      </div>

      {deactivateProduct.isError && <Alert variant="error">{getApiErrorMessage(deactivateProduct.error)}</Alert>}
      {reactivateProduct.isError && <Alert variant="error">{getApiErrorMessage(reactivateProduct.error)}</Alert>}
      {!product.isActive && !reactivateProduct.isError && (
        <Alert variant="info">
          This product is deactivated and hidden from the storefront. It still appears in the admin products
          list (filter by “Inactive only”) and can be reactivated from there or here.
        </Alert>
      )}

      {categoriesQuery.isPending && <Skeleton className={styles.skeletonBlock} />}

      {categoriesQuery.data && (
        <ProductForm
          categories={categoriesQuery.data}
          defaultValues={toFormValues(product)}
          isSubmitting={updateProduct.isPending}
          submitError={updateProduct.isError ? getApiErrorMessage(updateProduct.error) : null}
          submitLabel="Save changes"
          onSubmit={(values) => void handleUpdate(values)}
        />
      )}

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
    </section>
  )
}
