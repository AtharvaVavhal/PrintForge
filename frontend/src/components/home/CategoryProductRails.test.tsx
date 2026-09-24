import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import type { AxiosRequestConfig } from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import type { Category, Product } from '@/types/catalog'
import { CategoryProductRails } from './CategoryProductRails'

let mock: MockAdapter

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-mugs',
    name: 'Mugs',
    slug: 'mugs',
    parentCategoryId: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    categoryId: 'cat-mugs',
    name: 'Ceramic Mug',
    slug: 'ceramic-mug',
    basePrice: '150',
    minQuantity: 1,
    maxQuantity: null,
    specifications: null,
    isActive: true,
    avgRating: null,
    reviewCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    variants: [],
    images: [],
    customizationFields: [],
    ...overrides,
  }
}

function ok<T>(data: T, meta?: unknown): [number, unknown] {
  return [200, { success: true, data, ...(meta ? { meta } : {}) }]
}

beforeEach(() => {
  mock = new MockAdapter(apiClient)
})

afterEach(() => {
  mock.restore()
})

describe('CategoryProductRails', () => {
  it('skips a category with fewer than 3 products — a thin shelf is worse than no shelf', async () => {
    mock.onGet('/categories').reply(...ok([category({ id: 'c1', name: 'Mugs' })]))
    mock.onGet('/products').reply(
      ...ok(
        [product({ id: 'p1' }), product({ id: 'p2' })],
        { page: 1, limit: 12, total: 2, totalPages: 1 },
      ),
    )
    renderWithProviders(<CategoryProductRails />)

    // Give the query a tick to resolve, then assert the rail never appears.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('heading', { name: 'Mugs' })).not.toBeInTheDocument()
  })

  it('renders a rail per top-level category once it clears the minimum-products floor', async () => {
    mock.onGet('/categories').reply(
      ...ok([
        category({ id: 'c1', name: 'Mugs', slug: 'mugs' }),
        category({ id: 'c2', name: 'Apparel', slug: 'apparel' }),
        category({ id: 'c3', name: 'Sub Category', slug: 'sub-category', parentCategoryId: 'c1' }),
      ]),
    )
    mock.onGet('/products').reply((config: AxiosRequestConfig) => {
      const params = (config.params ?? {}) as Record<string, unknown>
      const items = [
        product({ id: `${params.categoryId}-1`, name: `${params.categoryId} Item 1` }),
        product({ id: `${params.categoryId}-2`, name: `${params.categoryId} Item 2` }),
        product({ id: `${params.categoryId}-3`, name: `${params.categoryId} Item 3` }),
      ]
      return ok(items, { page: 1, limit: 12, total: items.length, totalPages: 1 })
    })
    renderWithProviders(<CategoryProductRails />)

    const mugsRail = await screen.findByRole('region', { name: 'Mugs' })
    expect(within(mugsRail).getByRole('link', { name: /view all/i })).toHaveAttribute(
      'href',
      '/products?categoryId=c1',
    )
    expect(await screen.findByRole('region', { name: 'Apparel' })).toBeInTheDocument()
    // A sub-category never gets its own top-level rail.
    expect(screen.queryByRole('region', { name: 'Sub Category' })).not.toBeInTheDocument()
  })
})
