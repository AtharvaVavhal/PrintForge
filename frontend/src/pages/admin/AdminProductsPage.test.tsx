import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
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
    avgRating: null,
    reviewCount: 0,
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
  data: [{ id: 'cat-1', name: 'Drinkware', slug: 'drinkware', parentCategoryId: null, isActive: true }],
}

function adminProductsCalls(mock: MockAdapter) {
  return mock.history.get.filter((r) => r.url === '/products/admin')
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

  it('lists products (via GET /products/admin) and links each into the admin product detail route', async () => {
    mock.onGet('/products/admin').reply(200, productsResponse([buildProduct()]))

    renderWithProviders(<AdminProductsPage />)

    const link = await screen.findByRole('link', { name: /Ceramic Mug/ })
    expect(link).toHaveAttribute('href', '/admin/products/prod-1')
  })

  it('surfaces inactive products with an "Inactive" flag (the public list never would)', async () => {
    mock
      .onGet('/products/admin')
      .reply(200, productsResponse([buildProduct({ id: 'p2', name: 'Retired Mug', isActive: false })]))

    renderWithProviders(<AdminProductsPage />)

    expect(await screen.findByText('Retired Mug')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })

  it('has a status filter that adds ?status= and refetches', async () => {
    const user = userEvent.setup()
    mock.onGet('/products/admin').reply((config) => {
      const status = (config.params as { status?: string } | undefined)?.status
      const items = status === 'inactive' ? [buildProduct({ isActive: false })] : [buildProduct()]
      return [200, productsResponse(items)]
    })

    renderWithProviders(<AdminProductsPage />)

    await screen.findByText('Ceramic Mug')
    await user.selectOptions(screen.getByLabelText('Status'), 'inactive')

    await screen.findByText('Inactive')
    const statuses = adminProductsCalls(mock).map((r) => (r.params as { status?: string } | undefined)?.status)
    expect(statuses).toEqual([undefined, 'inactive'])
  })

  it('shows a category filter built from GET /categories and refilters on change', async () => {
    const user = userEvent.setup()
    mock.onGet('/products/admin').reply((config) => {
      const categoryId = (config.params as { categoryId?: string } | undefined)?.categoryId
      const items = categoryId === 'cat-1' ? [buildProduct()] : []
      return [200, productsResponse(items)]
    })

    renderWithProviders(<AdminProductsPage />)

    const select = await screen.findByLabelText('Category')
    await user.selectOptions(select, 'cat-1')

    expect(await screen.findByText('Ceramic Mug')).toBeInTheDocument()
    const calls = adminProductsCalls(mock)
    expect(calls.map((r) => (r.params as { categoryId?: string } | undefined)?.categoryId)).toEqual([
      undefined,
      'cat-1',
    ])
  })

  it('shows real pagination driven by the backend meta', async () => {
    mock.onGet('/products/admin').reply(200, productsResponse([buildProduct()], { totalPages: 2 }))

    renderWithProviders(<AdminProductsPage />)

    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument()
  })

  it('links to /admin/products/new for creating a product', async () => {
    mock.onGet('/products/admin').reply(200, productsResponse([]))

    renderWithProviders(<AdminProductsPage />)

    const link = await screen.findByRole('link', { name: 'New product' })
    expect(link).toHaveAttribute('href', '/admin/products/new')
  })

  it('renders a single h1 and the real page actions', async () => {
    mock.onGet('/products/admin').reply(200, productsResponse([buildProduct()]))

    renderWithProviders(<AdminProductsPage />)

    await screen.findByRole('link', { name: /Ceramic Mug/ })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Products')
    expect(screen.getByRole('link', { name: 'Manage categories' })).toHaveAttribute(
      'href',
      '/admin/categories',
    )
    expect(screen.getByRole('link', { name: 'New product' })).toHaveAttribute(
      'href',
      '/admin/products/new',
    )
  })

  it('renders a semantic table with the expected column headers and real product data', async () => {
    mock
      .onGet('/products/admin')
      .reply(200, productsResponse([buildProduct({ variants: [{ id: 'v1' }, { id: 'v2' }] })]))

    renderWithProviders(<AdminProductsPage />)

    const table = await screen.findByRole('table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    expect(headers).toEqual(['Product', 'Category', 'Price', 'Variants', 'Rating', 'Status'])

    const row = within(table).getByRole('link', { name: /Ceramic Mug/ }).closest('tr') as HTMLElement
    expect(within(row).getByText('Drinkware')).toBeInTheDocument()
    expect(within(row).getByText('₹150.00')).toBeInTheDocument()
    expect(within(row).getByText('2 variants')).toBeInTheDocument()
    expect(within(row).getByText('No reviews')).toBeInTheDocument()
    expect(within(row).getByText('ceramic-mug')).toBeInTheDocument()
  })

  it('shows a compact rating when avgRating is populated', async () => {
    mock
      .onGet('/products/admin')
      .reply(200, productsResponse([buildProduct({ avgRating: '4.5', reviewCount: 12 })]))

    renderWithProviders(<AdminProductsPage />)

    const table = await screen.findByRole('table')
    expect(within(table).getByText('4.5')).toBeInTheDocument()
    expect(within(table).getByText('(12)')).toBeInTheDocument()
  })

  it('shows an active/inactive status badge with a text label (not colour alone)', async () => {
    mock.onGet('/products/admin').reply(200, productsResponse([buildProduct({ isActive: true })]))

    renderWithProviders(<AdminProductsPage />)

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Active')).toBeInTheDocument()
  })

  it('falls back to an accessible image placeholder when a product has no images', async () => {
    mock.onGet('/products/admin').reply(200, productsResponse([buildProduct({ images: [] })]))

    renderWithProviders(<AdminProductsPage />)

    expect(await screen.findByRole('img', { name: /Ceramic Mug — no image available/ })).toBeInTheDocument()
  })

  it('renders a real thumbnail when the product has an image', async () => {
    mock.onGet('/products/admin').reply(
      200,
      productsResponse([
        buildProduct({
          images: [
            {
              id: 'img1',
              productId: 'prod-1',
              cloudinaryPublicId: 'x',
              resourceType: 'image',
              deliveryType: 'upload',
              url: 'https://example.test/mug.jpg',
              sortOrder: 0,
              isPrimary: true,
              createdAt: '2026-08-27T00:00:00.000Z',
            },
          ],
        }),
      ]),
    )

    renderWithProviders(<AdminProductsPage />)

    const img = await screen.findByRole('img', { name: 'Ceramic Mug' })
    expect(img).toHaveAttribute('src', 'https://example.test/mug.jpg')
  })

  it('resets to page 1 when a filter changes', async () => {
    const user = userEvent.setup()
    mock.onGet('/products/admin').reply(200, productsResponse([buildProduct()]))

    renderWithProviders(<AdminProductsPage />, { initialEntries: ['/admin/products?page=3'] })

    await screen.findByRole('link', { name: /Ceramic Mug/ })
    await user.selectOptions(screen.getByLabelText('Status'), 'active')

    await screen.findByRole('link', { name: /Ceramic Mug/ })
    expect(adminProductsCalls(mock).at(-1)?.params).toMatchObject({ status: 'active', page: 1 })
  })

  it('shows a page-level skeleton (polite loading status) while the first fetch is in flight', () => {
    mock.onGet('/products/admin').reply(() => new Promise(() => {}))

    renderWithProviders(<AdminProductsPage />)

    expect(screen.getByText('Loading').closest('[role="status"]')).toBeInTheDocument()
  })

  it('surfaces a fetch error through the shared Alert (getApiErrorMessage)', async () => {
    mock.onGet('/products/admin').reply(500)

    renderWithProviders(<AdminProductsPage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/something went wrong/i)
  })

  it('distinguishes a genuinely empty catalog from an empty filtered result', async () => {
    mock.onGet('/products/admin').reply(200, productsResponse([]))

    const { unmount } = renderWithProviders(<AdminProductsPage />)
    expect(await screen.findByText('No products yet')).toBeInTheDocument()
    unmount()

    renderWithProviders(<AdminProductsPage />, { initialEntries: ['/admin/products?status=inactive'] })
    expect(await screen.findByText('No products match these filters')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Clear filters' }).length).toBeGreaterThanOrEqual(1)
  })

  it('keeps the product name as the row’s only link (no whole-row navigation)', async () => {
    mock.onGet('/products/admin').reply(200, productsResponse([buildProduct()]))

    renderWithProviders(<AdminProductsPage />)

    const row = (await screen.findByRole('link', { name: /Ceramic Mug/ })).closest('tr') as HTMLElement
    expect(within(row).getAllByRole('link')).toHaveLength(1)
  })
})
