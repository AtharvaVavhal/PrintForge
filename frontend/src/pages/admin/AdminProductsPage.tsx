import { Link, useSearchParams } from 'react-router-dom'
import { useProducts } from '@/hooks/useProducts'
import { useCategories } from '@/hooks/useCategories'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { AdminProductRow } from '@/features/admin/AdminProductRow'
import { OrderListSkeleton } from '@/features/orders/OrderListSkeleton'
import { adminProductDetailPath, ROUTES } from '@/constants/routes'
import styles from './AdminProductsPage.module.css'

const DEFAULT_LIMIT = 20

/**
 * Behind AdminRoute (App.tsx). GENUINE BACKEND LIMITATION, confirmed
 * against the live products.service.ts (not assumed): `GET /products`
 * unconditionally filters `isActive: true` server-side, and there is no
 * `GET /products/:id` or admin bypass of any kind. This page is therefore
 * built on the same public endpoint the storefront uses — real pagination
 * (no client-side slicing), same pattern as AdminOrdersPage/
 * AdminCustomersPage — and it can only ever show active products. A
 * deactivated product (DELETE /products/:id) drops out of this list
 * entirely. `POST /products/:id/reactivate` exists (mirrors deactivate),
 * but this list still can't offer it — there's nothing to click it from,
 * since a deactivated product never appears here. Reactivating is only
 * reachable immediately after deactivating, on AdminProductDetailPage
 * itself, before navigating away (see that page's own doc comment); a
 * product deactivated in an earlier visit has no path back through this
 * UI at all. Flagged rather than silently building a "Reactivate" button
 * on this list that nothing could ever reach.
 */
export function AdminProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Number(searchParams.get('page') ?? '1')
  const categoryId = searchParams.get('categoryId') ?? undefined

  const productsQuery = useProducts({ page, limit: DEFAULT_LIMIT, categoryId })
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

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <h1>Products</h1>
        <Link to={adminProductDetailPath('new')}>
          <Button>New product</Button>
        </Link>
      </div>

      <Alert variant="info">
        Showing active products only — GET /products has no admin view of deactivated products. If you just
        deactivated one, you can still reactivate it from its own page before navigating away; once you leave,
        there's no way back to it.
      </Alert>

      {categoriesQuery.data && categoriesQuery.data.length > 0 && (
        <div className={styles.filterRow}>
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
        </div>
      )}

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
