import { useCategories } from '@/hooks/useCategories'
import { ROUTES } from '@/constants/routes'
import { ProductRail } from './ProductRail'

/** A category rail thinner than this looks sparse/broken rather than like a
 * real shelf — see the Phase 13.8 homepage-redesign report (catalog-gap
 * finding): the current dev catalogue is almost entirely QA fixture
 * categories with a single product each, and none of those should ever
 * read as a real storefront section. This floor holds regardless of how
 * much real catalogue data eventually exists. */
const MIN_PRODUCTS_PER_CATEGORY_RAIL = 3

/**
 * "Stacked category blocks" — one product rail per top-level category,
 * printo.in-style. Backed by the same live categories query CategoryRail
 * uses; each category's rail independently hides itself via ProductRail's
 * `minItems` guard when that category doesn't have enough products yet, so
 * this never renders a half-empty shelf for a thin or QA-only category.
 */
export function CategoryProductRails() {
  const { data: categories, isError } = useCategories()

  if (isError) return null

  const topLevel = (categories ?? []).filter((c) => c.parentCategoryId === null)

  return (
    <>
      {topLevel.map((category) => (
        <ProductRail
          key={category.id}
          id={`home-category-${category.slug}-heading`}
          title={category.name}
          params={{ categoryId: category.id, sort: 'newest' }}
          viewAllHref={`${ROUTES.PRODUCTS}?categoryId=${encodeURIComponent(category.id)}`}
          minItems={MIN_PRODUCTS_PER_CATEGORY_RAIL}
        />
      ))}
    </>
  )
}
