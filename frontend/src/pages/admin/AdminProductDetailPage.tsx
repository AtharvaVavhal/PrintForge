import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useCategories } from '@/hooks/useCategories'
import { useCreateProduct } from '@/hooks/useCreateProduct'
import { useUpdateProduct } from '@/hooks/useUpdateProduct'
import { useDeactivateProduct } from '@/hooks/useDeactivateProduct'
import { ProductForm } from '@/features/admin/ProductForm'
import { VariantManager } from '@/features/admin/VariantManager'
import { CustomizationFieldManager } from '@/features/admin/CustomizationFieldManager'
import { ProductImageManager } from '@/features/admin/ProductImageManager'
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
      // The product drops out of GET /products the instant it's
      // deactivated — nothing left for this page to show, so head back
      // to the list rather than rendering a now-unreachable "edit" view.
      void navigate(ROUTES.ADMIN_PRODUCTS)
    } catch {
      // Error surfaced via deactivateProduct.isError below.
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
        {product.isActive && (
          <Button
            type="button"
            variant="secondary"
            isLoading={deactivateProduct.isPending}
            onClick={() => void handleDeactivate()}
          >
            Deactivate
          </Button>
        )}
      </div>

      {deactivateProduct.isError && <Alert variant="error">{getApiErrorMessage(deactivateProduct.error)}</Alert>}

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
    </section>
  )
}
