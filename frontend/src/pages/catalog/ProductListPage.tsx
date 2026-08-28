import { useSearchParams } from 'react-router-dom'
import { useProducts } from '@/hooks/useProducts'
import { useCategories } from '@/hooks/useCategories'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { CategoryFilter } from '@/features/catalog/CategoryFilter'
import { EmptyCatalog } from '@/features/catalog/EmptyCatalog'
import { ProductCard } from '@/features/catalog/ProductCard'
import { ProductGridSkeleton } from '@/features/catalog/ProductGridSkeleton'
import gridStyles from '@/features/catalog/ProductGrid.module.css'
import styles from './ProductListPage.module.css'

const DEFAULT_LIMIT = 20

export function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const categoryId = searchParams.get('categoryId') ?? undefined
  const search = searchParams.get('search') ?? undefined
  const page = Number(searchParams.get('page') ?? '1')

  const categoriesQuery = useCategories()
  const productsQuery = useProducts({ categoryId, search, page, limit: DEFAULT_LIMIT })

  function goToPage(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('page', String(nextPage))
      return next
    })
  }

  return (
    <section className={styles.wrap}>
      <h1>Shop</h1>
      {search && <p className={styles.searchResultLabel}>Results for &quot;{search}&quot;</p>}

      {categoriesQuery.data && categoriesQuery.data.length > 0 && (
        <CategoryFilter categories={categoriesQuery.data} />
      )}

      {productsQuery.isPending && <ProductGridSkeleton />}

      {productsQuery.isError && (
        <Alert variant="error">{getApiErrorMessage(productsQuery.error)}</Alert>
      )}

      {productsQuery.data && productsQuery.data.items.length === 0 && (
        <EmptyCatalog hasFilter={Boolean(categoryId) || Boolean(search)} />
      )}

      {productsQuery.data && productsQuery.data.items.length > 0 && (
        <>
          <div className={gridStyles.grid}>
            {productsQuery.data.items.map((product) => (
              <ProductCard key={product.id} product={product} showQuickAdd />
            ))}
          </div>

          {productsQuery.data.meta.totalPages > 1 && (
            <div className={styles.pagination}>
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
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
    </section>
  )
}
