import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProducts } from '@/hooks/useProducts'
import { useCategoryTree } from '@/hooks/useCategoryTree'
import { getApiErrorMessage } from '@/utils/apiError'
import { ROUTES } from '@/constants/routes'
import { Alert } from '@/components/ui/Alert'
import { Breadcrumbs, type Crumb } from '@/components/ui/Breadcrumbs'
import { Pagination } from '@/components/ui/Pagination'
import { FilterSidebar } from '@/components/layout/FilterSidebar'
import { FilterTrigger, MobileFilterDrawer } from '@/components/layout/MobileFilterDrawer'
import { ActiveFilterChips } from '@/features/catalog/ActiveFilterChips'
import { findCategoryPath } from '@/features/catalog/categoryTree'
import { Seo } from '@/seo/Seo'
import { breadcrumbJsonLd } from '@/seo/jsonLd'
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

  const { data: categoryTree = [] } = useCategoryTree()
  const categoryPath = useMemo(
    () => findCategoryPath(categoryTree, categoryId),
    [categoryTree, categoryId],
  )
  const activeCategory = categoryPath.at(-1)

  const pageTitle = activeCategory
    ? activeCategory.name
    : search
      ? 'Search results'
      : 'All products'

  const breadcrumbs: Crumb[] = [
    { label: 'Home', to: ROUTES.HOME },
    activeCategory || search
      ? { label: 'All products', to: ROUTES.PRODUCTS }
      : { label: 'All products' },
    ...categoryPath.map((node, index) => ({
      label: node.name,
      to:
        index === categoryPath.length - 1
          ? undefined
          : `${ROUTES.PRODUCTS}?categoryId=${node.id}`,
    })),
    ...(search && !activeCategory ? [{ label: `“${search}”` }] : []),
  ]

  // Only the bare listing and single-category views are indexable. Any
  // search term, price/rating filter, explicit sort, or page > 1 makes
  // this a filtered variant → noindex, and it canonicalises to the
  // category (or all-products) route so crawl budget isn't spent on the
  // combinatorial filter space (§4/§14).
  const isFilteredVariant = Boolean(
    search ||
      minPrice !== undefined ||
      maxPrice !== undefined ||
      minRating !== undefined ||
      sort ||
      page > 1,
  )
  const canonicalPath = categoryId
    ? `${ROUTES.PRODUCTS}?categoryId=${categoryId}`
    : ROUTES.PRODUCTS
  const seoDescription = activeCategory
    ? `Shop ${activeCategory.name} at PrintForge — custom-printed, made to order.`
    : 'Browse every product in the PrintForge catalogue. Personalise and order custom prints made to order.'

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
      <Seo
        title={pageTitle}
        description={seoDescription}
        canonicalPath={canonicalPath}
        noindex={isFilteredVariant}
        jsonLd={
          isFilteredVariant ? undefined : (breadcrumbJsonLd(breadcrumbs) ?? undefined)
        }
      />
      <Breadcrumbs items={breadcrumbs} />

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{pageTitle}</h1>
          {search && activeCategory && (
            <p className={styles.searchResultLabel}>Results for "{search}"</p>
          )}
        </div>
        {productsQuery.data && (
          <p className={styles.resultCount} aria-live="polite">
            {productsQuery.data.meta.total} {productsQuery.data.meta.total === 1 ? 'product' : 'products'}
          </p>
        )}
      </div>

      <ActiveFilterChips />

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

              <Pagination
                page={productsQuery.data.meta.page}
                totalPages={productsQuery.data.meta.totalPages}
                onPageChange={goToPage}
                label="Products pagination"
              />
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
