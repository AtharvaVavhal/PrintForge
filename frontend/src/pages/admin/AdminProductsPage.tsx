import { Link, useSearchParams } from 'react-router-dom'
import { useAdminProducts } from '@/hooks/useAdminProducts'
import { useCategories } from '@/hooks/useCategories'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { AdminPage } from '@/components/admin/AdminPage'
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminTable } from '@/components/admin/AdminTable'
import { AdminSelect } from '@/components/admin/AdminSelect'
import { AdminBadge } from '@/components/admin/AdminBadge'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { AdminPageSkeleton } from '@/components/admin/AdminPageSkeleton'
import { ProductImage } from '@/features/catalog/ProductImage'
import { adminProductDetailPath, ROUTES } from '@/constants/routes'
import { formatPrice } from '@/utils/formatPrice'
import styles from './AdminProductsPage.module.css'

const DEFAULT_LIMIT = 20

function getStatus(value: string | null): 'active' | 'inactive' | undefined {
  return value === 'active' || value === 'inactive' ? value : undefined
}

/**
 * Behind AdminRoute (App.tsx). Built on GET /products/admin (Phase 13.2),
 * which — unlike the public GET /products the storefront uses — returns
 * inactive products too. Real backend pagination (no client-side
 * slicing), same pattern as AdminOrdersPage/AdminCustomersPage. A
 * deactivated product stays in this list with an "Inactive" badge and can
 * be reactivated from its detail page; the `status` filter narrows to one
 * side. Each row hands the full product object to the detail page via
 * router `state` (GET /products/admin already returns the full nested
 * variants/images/customizationFields), so opening one needs no refetch.
 */
export function AdminProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Number(searchParams.get('page') ?? '1')
  const categoryId = searchParams.get('categoryId') ?? undefined
  const status = getStatus(searchParams.get('status'))

  const productsQuery = useAdminProducts({
    page,
    limit: DEFAULT_LIMIT,
    categoryId,
    status,
  })
  const categoriesQuery = useCategories()

  const categoryNameById = new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name]))
  const hasActiveFilters = Boolean(categoryId || status)

  function goToPage(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('page', String(nextPage))
      return next
    })
  }

  function setFilter(key: 'categoryId' | 'status', value: string) {
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
      next.delete('categoryId')
      next.delete('status')
      next.set('page', '1')
      return next
    })
  }

  if (productsQuery.isPending) {
    return <AdminPageSkeleton rows={4} />
  }

  const data = productsQuery.data

  return (
    <AdminPage
      title="Products"
      description="The full catalog, including deactivated products."
      actions={
        <>
          <Link to={ROUTES.ADMIN_CATEGORIES} className={styles.secondaryAction}>
            Manage categories
          </Link>
          <Link to={adminProductDetailPath('new')}>
            <Button>New product</Button>
          </Link>
        </>
      }
    >
      <AdminCard as="section" title="Filters">
        <div className={styles.filters}>
          <AdminSelect
            label="Status"
            name="status"
            value={status ?? ''}
            onChange={(event) => setFilter('status', event.target.value)}
          >
            <option value="">Active &amp; inactive</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </AdminSelect>

          {categoriesQuery.data && categoriesQuery.data.length > 0 && (
            <AdminSelect
              label="Category"
              name="categoryId"
              value={categoryId ?? ''}
              onChange={(event) => setFilter('categoryId', event.target.value)}
            >
              <option value="">All categories</option>
              {categoriesQuery.data.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </AdminSelect>
          )}

          {hasActiveFilters && (
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </AdminCard>

      {productsQuery.isError ? (
        <Alert variant="error">{getApiErrorMessage(productsQuery.error)}</Alert>
      ) : data && data.items.length === 0 ? (
        <AdminEmptyState
          title={hasActiveFilters ? 'No products match these filters' : 'No products yet'}
          description={
            hasActiveFilters
              ? 'Try a different category or status.'
              : 'Add your first product to start building the catalog.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : data ? (
        <div className={styles.results} aria-busy={productsQuery.isFetching || undefined}>
          <AdminCard flush>
            <AdminTable caption="Products">
              <AdminTable.Head>
                <AdminTable.Row>
                  <AdminTable.HeaderCell>Product</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell>Category</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell align="end">Price</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell align="center">Variants</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell align="center">Rating</AdminTable.HeaderCell>
                  <AdminTable.HeaderCell>Status</AdminTable.HeaderCell>
                </AdminTable.Row>
              </AdminTable.Head>
              <AdminTable.Body>
                {data.items.map((product) => (
                  <AdminTable.Row key={product.id}>
                    <AdminTable.Cell>
                      <div className={styles.product}>
                        <span className={styles.thumb}>
                          <ProductImage
                            key={product.id}
                            images={product.images}
                            label={product.name}
                          />
                        </span>
                        <span className={styles.identity}>
                          <Link
                            to={adminProductDetailPath(product.id)}
                            state={{ product }}
                            className={styles.productLink}
                          >
                            {product.name}
                          </Link>
                          <span className={styles.slug}>{product.slug}</span>
                        </span>
                      </div>
                    </AdminTable.Cell>
                    <AdminTable.Cell>
                      {categoryNameById.get(product.categoryId) ?? '—'}
                    </AdminTable.Cell>
                    <AdminTable.Cell align="end">{formatPrice(product.basePrice)}</AdminTable.Cell>
                    <AdminTable.Cell align="center">
                      {product.variants.length}{' '}
                      {product.variants.length === 1 ? 'variant' : 'variants'}
                    </AdminTable.Cell>
                    <AdminTable.Cell align="center">
                      {product.avgRating !== null ? (
                        <span>
                          {Number(product.avgRating).toFixed(1)}{' '}
                          <span className={styles.muted}>({product.reviewCount})</span>
                        </span>
                      ) : (
                        <span className={styles.muted}>No reviews</span>
                      )}
                    </AdminTable.Cell>
                    <AdminTable.Cell>
                      {product.isActive ? (
                        <AdminBadge variant="success">Active</AdminBadge>
                      ) : (
                        <AdminBadge variant="neutral">Inactive</AdminBadge>
                      )}
                    </AdminTable.Cell>
                  </AdminTable.Row>
                ))}
              </AdminTable.Body>
            </AdminTable>
          </AdminCard>

          <AdminPagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            onPageChange={goToPage}
            label="Products pagination"
          />
        </div>
      ) : null}
    </AdminPage>
  )
}
