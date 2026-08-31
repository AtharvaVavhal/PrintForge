import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProducts } from '@/hooks/useProducts'
import { getApiErrorMessage } from '@/utils/apiError'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FilterSidebar } from '@/components/layout/FilterSidebar'
import { FilterTrigger, MobileFilterDrawer } from '@/components/layout/MobileFilterDrawer'
import { EmptyCatalog } from '@/features/catalog/EmptyCatalog'
import { ProductCard } from '@/features/catalog/ProductCard'
import { ProductGridSkeleton } from '@/features/catalog/ProductGridSkeleton'
import gridStyles from '@/features/catalog/ProductGrid.module.css'
import type { ListProductsParams } from '@/types/catalog'
import styles from './ProductListPage.module.css'

const DEFAULT_LIMIT = 20

function getOptionalNumber(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function getSort(value: string | null): ListProductsParams['sort'] {
  if (
    value === 'newest' ||
    value === 'price_asc' ||
    value === 'price_desc' ||
    value === 'rating_desc'
  ) {
    return value
  }
  return undefined
}

export function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false)
  const categoryId = searchParams.get('categoryId') ?? undefined
  const search = searchParams.get('search') ?? undefined
  const page = Number(searchParams.get('page') ?? '1')
  const minPrice = getOptionalNumber(searchParams.get('minPrice'))
  const maxPrice = getOptionalNumber(searchParams.get('maxPrice'))
  const minRating = getOptionalNumber(searchParams.get('minRating'))
  const sort = getSort(searchParams.get('sort'))

  const hasProductFilters = Boolean(categoryId || minPrice !== undefined || maxPrice !== undefined || minRating !== undefined || sort)
  const hasResultFilters = Boolean(search || hasProductFilters)
  const productsQuery = useProducts({
    categoryId,
    search,
    page,
    limit: DEFAULT_LIMIT,
    minPrice,
    maxPrice,
    minRating,
    sort,
  })

  function goToPage(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('page', String(nextPage))
      return next
    })
  }

  function handleClearAllFilters() {
    setIsFilterDrawerOpen(false)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('page')
      next.delete('categoryId')
      next.delete('minPrice')
      next.delete('maxPrice')
      next.delete('minRating')
      next.delete('sort')
      return next
    })
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Shop</h1>
          {search && <p className={styles.searchResultLabel}>Results for "{search}"</p>}
        </div>
        {productsQuery.data && (
          <p className={styles.resultCount} aria-live="polite">
            {productsQuery.data.meta.total} {productsQuery.data.meta.total === 1 ? 'product' : 'products'}
          </p>
        )}
      </div>

      <div className={styles.mobileFilterBar}>
        <FilterTrigger
          isOpen={isFilterDrawerOpen}
          onClick={() => setIsFilterDrawerOpen(true)}
          hasActiveFilters={hasProductFilters}
        />
      </div>

      <div className={styles.catalogLayout}>
        <div className={styles.desktopSidebar}>
          <FilterSidebar
            activeCategoryId={categoryId}
            hasActiveFilters={hasProductFilters}
            onClearAll={handleClearAllFilters}
          />
        </div>

        <div className={styles.results}>
          {productsQuery.isPending && <ProductGridSkeleton />}

          {productsQuery.isError && (
            <Alert variant="error">{getApiErrorMessage(productsQuery.error)}</Alert>
          )}

          {productsQuery.data && productsQuery.isFetching && (
            <p className={styles.updating} aria-live="polite">
              Updating results...
            </p>
          )}

          {productsQuery.data && productsQuery.data.items.length === 0 && (
            <EmptyCatalog hasFilter={hasResultFilters} />
          )}

          {productsQuery.data && productsQuery.data.items.length > 0 && (
            <>
              <div className={gridStyles.grid}>
                {productsQuery.data.items.map((product) => (
                  <ProductCard key={product.id} product={product} />
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
        </div>
      </div>

      <MobileFilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        activeCategoryId={categoryId}
        hasActiveFilters={hasProductFilters}
        onClearAll={handleClearAllFilters}
      />
    </section>
  )
}
