import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { ProductListPage } from './ProductListPage'

const CATEGORY_TREE_RESPONSE = {
  success: true,
  data: [
    {
      id: 'cat-1',
      name: 'Mugs',
      slug: 'mugs',
      children: [
        { id: 'cat-2', name: 'Tumblers', slug: 'tumblers', children: [] },
      ],
    },
  ],
}

function productsResponse(items: unknown[]) {
  return {
    success: true,
    data: items,
    meta: { page: 1, limit: 20, total: items.length, totalPages: Math.max(1, items.length) },
  }
}

const SAMPLE_PRODUCT = {
  id: 'prod-1',
  categoryId: 'cat-1',
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
}

describe('ProductListPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  it('renders products returned by the API', async () => {
    mock.onGet('/categories/tree').reply(200, CATEGORY_TREE_RESPONSE)
    mock.onGet('/products').reply(200, productsResponse([SAMPLE_PRODUCT]))

    renderWithProviders(<ProductListPage />)

    expect(await screen.findByText('Ceramic Mug')).toBeInTheDocument()
    expect(screen.getByText('₹150.00')).toBeInTheDocument()
  })

  it('renders the empty-catalog state when there are zero products', async () => {
    mock.onGet('/categories/tree').reply(200, CATEGORY_TREE_RESPONSE)
    mock.onGet('/products').reply(200, productsResponse([]))

    renderWithProviders(<ProductListPage />)

    expect(await screen.findByText('No products yet')).toBeInTheDocument()
  })

  it('renders an error state when the products request fails', async () => {
    mock.onGet('/categories/tree').reply(200, CATEGORY_TREE_RESPONSE)
    mock.onGet('/products').reply(500, {
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something broke', details: [] },
    })

    renderWithProviders(<ProductListPage />)

    expect(await screen.findByText('Something broke')).toBeInTheDocument()
  })

  it('forwards URL filters to the product list request', async () => {
    mock.onGet('/categories/tree').reply(200, CATEGORY_TREE_RESPONSE)
    mock.onGet('/products').reply(200, productsResponse([SAMPLE_PRODUCT]))

    renderWithProviders(<ProductListPage />, {
      initialEntries: [
        '/products?categoryId=cat-1&search=mug&page=3&minPrice=100&maxPrice=500&minRating=4&sort=price_asc',
      ],
    })

    expect(await screen.findByText('Ceramic Mug')).toBeInTheDocument()

    const productsCall = mock.history.get.find((request) => request.url === '/products')
    expect(productsCall?.params).toMatchObject({
      categoryId: 'cat-1',
      search: 'mug',
      page: 3,
      limit: 20,
      minPrice: 100,
      maxPrice: 500,
      minRating: 4,
      sort: 'price_asc',
    })
  })

  it('updates category and sub-category filters from the sidebar', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/tree').reply(200, CATEGORY_TREE_RESPONSE)
    mock.onGet('/products').reply(200, productsResponse([SAMPLE_PRODUCT]))

    renderWithProviders(<ProductListPage />)

    await user.click(await screen.findByRole('button', { name: 'Mugs' }))
    await waitFor(() => {
      expect(mock.history.get.at(-1)?.params).toMatchObject({ categoryId: 'cat-1' })
    })

    await user.click(await screen.findByRole('button', { name: 'Tumblers' }))
    await waitFor(() => {
      expect(mock.history.get.at(-1)?.params).toMatchObject({ categoryId: 'cat-2' })
    })
  })
})
