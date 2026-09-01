import { Link, useSearchParams } from 'react-router-dom'
import { useAdminProducts } from '@/hooks/useAdminProducts'
import { useCategories } from '@/hooks/useCategories'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { AdminProductRow } from '@/features/admin/AdminProductRow'
import { OrderListSkeleton } from '@/features/orders/OrderListSkeleton'
import { adminProductDetailPath, ROUTES } from '@/constants/routes'
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
 * side.
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

  function goToPage(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('page', String(nextPage))
      return next
    })
  }

  function handleCategoryChange(nextCategoryId: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (nextCategoryId) {
        next.set('categoryId', nextCategoryId)
      } else {
        next.delete('categoryId')
      }
      next.set('page', '1')
      return next
    })
  }

  function handleStatusChange(nextStatus: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (nextStatus) {
        next.set('status', nextStatus)
      } else {
        next.delete('status')
      }
      next.set('page', '1')
      return next
    })
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <h1>Products</h1>
        <Link to={adminProductDetailPath('new')}>
          <Button>New product</Button>
        </Link>
      </div>

      <div className={styles.filterRow}>
        <label htmlFor="status-filter" className={styles.filterLabel}>
          Status
        </label>
        <select
          id="status-filter"
          className={styles.filterSelect}
          value={status ?? ''}
          onChange={(event) => handleStatusChange(event.target.value)}
        >
          <option value="">Active &amp; inactive</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>

        {categoriesQuery.data && categoriesQuery.data.length > 0 && (
          <>
            <label htmlFor="category-filter" className={styles.filterLabel}>
              Category
            </label>
            <select
              id="category-filter"
              className={styles.filterSelect}
              value={categoryId ?? ''}
              onChange={(event) => handleCategoryChange(event.target.value)}
            >
              <option value="">All categories</option>
              {categoriesQuery.data.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {productsQuery.isPending && <OrderListSkeleton />}

      {productsQuery.isError && <Alert variant="error">{getApiErrorMessage(productsQuery.error)}</Alert>}

      {productsQuery.data && productsQuery.data.items.length === 0 && (
        <p className={styles.empty}>No products found.</p>
      )}

      {productsQuery.data && productsQuery.data.items.length > 0 && (
        <>
          <div className={styles.list}>
            {productsQuery.data.items.map((product) => (
              <AdminProductRow key={product.id} product={product} />
            ))}
          </div>

          {productsQuery.data.meta.totalPages > 1 && (
            <div className={styles.pagination}>
              <Button variant="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </Button>
              <span className={styles.pageIndicator}>
                Page {productsQuery.data.meta.page} of {productsQuery.data.meta.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= productsQuery.data.meta.totalPages}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <p className={styles.categoriesLink}>
        <Link to={ROUTES.ADMIN_CATEGORIES}>Manage categories</Link>
      </p>
    </section>
  )
}
