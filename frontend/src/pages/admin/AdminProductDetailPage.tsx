import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useCategories } from '@/hooks/useCategories'
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
 * Behind AdminRoute (App.tsx). There is no `GET /products/:id` on the
 * backend (confirmed against products.controller.ts — public lookup is by
 * :slug only, and it's isActive-filtered besides), so this page can't
 * fetch its own data from a direct URL the way AdminOrderDetailPage does.
 * Instead: `/admin/products/new` (the literal ":id" value "new") is
 * create mode; any other id expects the full Product object handed over
 * via router `state` from AdminProductRow's click (GET /products already
 * returns everything — variants/images/customizationFields — per row, so
 * there's nothing left to fetch). A direct visit/refresh with no state
 * shows a message pointing back to the list rather than attempting an
 * API call that doesn't exist.
 *
 * Local component state (`product`) is the single source of truth for
 * this page once loaded — each sub-manager (VariantManager etc.) patches
 * it from its own mutation's response, never from a refetch.
 *
 * Reactivating a deactivated product (POST /products/:id/reactivate) is
 * only ever reachable from here, right after deactivating, before
 * navigating away — never from AdminProductsPage's list, which is
 * structurally incapable of ever showing an inactive product (GET
 * /products filters isActive:true unconditionally, confirmed live, no
 * admin bypass). A product deactivated in an earlier session has no path
 * back to this page at all: there's still no way to look one up once
 * it's out of local state. Deliberately not solved here — that would mean
 * adding a list-visibility affordance (a query param, an admin toggle),
 * a bigger change than "add a reactivate endpoint," and out of this
 * phase's scope. Flagged in the completion report as the residual gap.
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
      // Stay on the page (previously this navigated back to the products
      // list, which was the dead end: GET /products immediately stops
      // returning this product, so there was no way back to it at all).
      // The still-open local `product` state is now the *only* place this
      // product remains reachable from — that's exactly the moment the
      // Reactivate action below needs to exist.
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
        <Alert variant="error">
          This page needs to be opened from the products list — there's no way to look up a single product by
          id directly.
        </Alert>
        <p>
          <Link to={ROUTES.ADMIN_PRODUCTS}>Back to products</Link>
        </p>
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
          This product is deactivated and no longer visible in the storefront or the products list. Reactivate
          it now, or navigate away — there is currently no way to find it again afterward.
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
