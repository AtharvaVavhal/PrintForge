import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { createMockAuthContext, createTestQueryClient, renderWithProviders } from '@/test/test-utils'
import { HomePage } from './HomePage'

const CATEGORIES_RESPONSE = {
  success: true,
  data: [
    { id: 'cat-1', name: 'Mugs', slug: 'mugs', parentCategoryId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'cat-2', name: 'Tees', slug: 'tees', parentCategoryId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ],
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

function productsResponse(items: unknown[]) {
  return {
    success: true,
    data: items,
    meta: { page: 1, limit: 8, total: items.length, totalPages: Math.max(1, items.length) },
  }
}

describe('HomePage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  it('renders the trust bar claims', () => {
    mock.onGet('/categories').reply(200, CATEGORIES_RESPONSE)
    mock.onGet('/products').reply(200, productsResponse([SAMPLE_PRODUCT]))

    renderWithProviders(<HomePage />, { authValue: createMockAuthContext({ status: 'unauthenticated' }) })

    expect(screen.getByText('Secure checkout via Razorpay')).toBeInTheDocument()
  })

  it('renders one category card per category, linking to the filtered product list', async () => {
    mock.onGet('/categories').reply(200, CATEGORIES_RESPONSE)
    mock.onGet('/products').reply(200, productsResponse([]))

    renderWithProviders(<HomePage />, { authValue: createMockAuthContext({ status: 'unauthenticated' }) })

    const mugsLink = await screen.findByRole('link', { name: 'Mugs' })
    expect(mugsLink).toHaveAttribute('href', '/products?categoryId=cat-1')
    expect(screen.getByRole('link', { name: 'Tees' })).toHaveAttribute('href', '/products?categoryId=cat-2')
  })

  it('omits the "Shop by category" section entirely when there are zero categories', async () => {
    mock.onGet('/categories').reply(200, { success: true, data: [] })
    mock.onGet('/products').reply(200, productsResponse([]))
    const queryClient = createTestQueryClient()

    renderWithProviders(<HomePage />, {
      authValue: createMockAuthContext({ status: 'unauthenticated' }),
      queryClient,
    })

    // Assert against the query's actual resolved state, not a fixed tick —
    // the section is (correctly) absent during the pending state too, so a
    // check that doesn't wait for resolution would pass trivially.
    await waitFor(() => {
      expect(queryClient.getQueryState(['categories'])?.status).toBe('success')
    })
    expect(screen.queryByText('Shop by category')).not.toBeInTheDocument()
  })

  it('renders "New arrivals" with a ProductCard per returned product', async () => {
    mock.onGet('/categories').reply(200, { success: true, data: [] })
    mock.onGet('/products').reply(200, productsResponse([SAMPLE_PRODUCT]))

    renderWithProviders(<HomePage />, { authValue: createMockAuthContext({ status: 'unauthenticated' }) })

    expect(await screen.findByText('New arrivals')).toBeInTheDocument()
    expect(await screen.findByText('Ceramic Mug')).toBeInTheDocument()
  })

  it('omits the "New arrivals" section entirely when there are zero products', async () => {
    mock.onGet('/categories').reply(200, { success: true, data: [] })
    mock.onGet('/products').reply(200, productsResponse([]))
    const queryClient = createTestQueryClient()

    renderWithProviders(<HomePage />, {
      authValue: createMockAuthContext({ status: 'unauthenticated' }),
      queryClient,
    })

    // The section legitimately renders (with a skeleton) while the query is
    // still pending, so wait for actual resolution before asserting absence
    // — otherwise this would pass trivially on the pending-state render.
    await waitFor(() => {
      expect(queryClient.getQueryState(['products', 'list', { limit: 8 }])?.status).toBe('success')
    })
    expect(screen.queryByText('New arrivals')).not.toBeInTheDocument()
  })

  it('always renders the static "How it works" steps', async () => {
    mock.onGet('/categories').reply(200, { success: true, data: [] })
    mock.onGet('/products').reply(200, productsResponse([]))

    renderWithProviders(<HomePage />, { authValue: createMockAuthContext({ status: 'unauthenticated' }) })

    expect(await screen.findByText('How it works')).toBeInTheDocument()
    expect(screen.getByText('Choose & customize')).toBeInTheDocument()
    expect(screen.getByText('We print it')).toBeInTheDocument()
    expect(screen.getByText('Delivery')).toBeInTheDocument()
  })
})
