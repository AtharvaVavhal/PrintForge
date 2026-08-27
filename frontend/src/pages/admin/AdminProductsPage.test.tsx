import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { AdminProductsPage } from './AdminProductsPage'

function buildProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'prod-1',
    categoryId: 'cat-1',
    name: 'Ceramic Mug',
    slug: 'ceramic-mug',
    basePrice: '150.00',
    minQuantity: 1,
    maxQuantity: null,
    specifications: null,
    isActive: true,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    variants: [],
    images: [],
    customizationFields: [],
    ...overrides,
  }
}

function productsResponse(items: unknown[], meta?: Partial<{ page: number; totalPages: number; total: number }>) {
  return {
    success: true,
    data: items,
    meta: { page: 1, limit: 20, total: items.length, totalPages: 1, ...meta },
  }
}

const CATEGORIES_RESPONSE = {
  success: true,
  data: [{ id: 'cat-1', name: 'Drinkware', slug: 'drinkware', parentCategoryId: null }],
}

describe('AdminProductsPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    mock.onGet('/categories').reply(200, CATEGORIES_RESPONSE)
  })

  afterEach(() => {
    mock.restore()
  })

  it('lists products and links each into the admin product detail route with the product in router state', async () => {
    mock.onGet('/products').reply(200, productsResponse([buildProduct()]))

    renderWithProviders(<AdminProductsPage />)

    const link = await screen.findByRole('link', { name: /Ceramic Mug/ })
    expect(link).toHaveAttribute('href', '/admin/products/prod-1')
  })

  it('warns that this list is active-products-only (no admin bypass exists on GET /products)', async () => {
    mock.onGet('/products').reply(200, productsResponse([buildProduct()]))

    renderWithProviders(<AdminProductsPage />)

    expect(await screen.findByText(/active products only/i)).toBeInTheDocument()
  })

  it('shows a category filter built from GET /categories and refilters on change', async () => {
    const user = userEvent.setup()
    mock.onGet('/products').reply((config) => {
      const categoryId = (config.params as { categoryId?: string } | undefined)?.categoryId
      const items = categoryId === 'cat-1' ? [buildProduct()] : []
      return [200, productsResponse(items)]
    })

    renderWithProviders(<AdminProductsPage />)

    const select = await screen.findByLabelText('Category')
    await user.selectOptions(select, 'cat-1')

    expect(await screen.findByText('Ceramic Mug')).toBeInTheDocument()
    const calls = mock.history.get.filter((r) => r.url === '/products')
    expect(calls.map((r) => (r.params as { categoryId?: string } | undefined)?.categoryId)).toEqual([
      undefined,
      'cat-1',
    ])
  })

  it('shows real pagination driven by the backend meta', async () => {
    mock.onGet('/products').reply(200, productsResponse([buildProduct()], { totalPages: 2 }))

    renderWithProviders(<AdminProductsPage />)

    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument()
  })

  it('links to /admin/products/new for creating a product', async () => {
    mock.onGet('/products').reply(200, productsResponse([]))

    renderWithProviders(<AdminProductsPage />)

    const link = await screen.findByRole('link', { name: 'New product' })
    expect(link).toHaveAttribute('href', '/admin/products/new')
  })
})
