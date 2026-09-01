import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { createTestQueryClient } from '@/test/test-utils'
import type { Product } from '@/types/catalog'
import { AdminProductDetailPage } from './AdminProductDetailPage'

const CATEGORIES_RESPONSE = {
  success: true,
  data: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Drinkware', slug: 'drinkware', parentCategoryId: null }],
}

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    categoryId: '11111111-1111-4111-8111-111111111111',
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

function renderAt(pathname: string, state?: unknown) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname, state }]}>
        <Routes>
          <Route path="/admin/products/:id" element={<AdminProductDetailPage />} />
          <Route path="/admin/products" element={<p>Products list page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AdminProductDetailPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    mock.onGet('/categories').reply(200, CATEGORIES_RESPONSE)
    // ProductReviewModeration (rendered whenever a product is loaded)
    // fetches this on mount — an empty list is the harmless default for
    // every test that isn't specifically exercising moderation.
    mock.onGet('/products/prod-1/reviews').reply(200, {
      success: true,
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
    })
  })

  afterEach(() => {
    mock.restore()
  })

  it('create mode (/admin/products/new): renders an empty form and POSTs on submit', async () => {
    const user = userEvent.setup()
    mock.onPost('/products').reply(201, { success: true, data: buildProduct({ id: 'prod-new' }) })

    renderAt('/admin/products/new')

    expect(await screen.findByRole('heading', { name: 'New product' })).toBeInTheDocument()
    await user.selectOptions(await screen.findByLabelText('Category'), '11111111-1111-4111-8111-111111111111')
    await user.type(screen.getByLabelText('Name'), 'Ceramic Mug')
    await user.type(screen.getByLabelText('Slug'), 'ceramic-mug')
    await user.type(screen.getByLabelText('Base price'), '150')
    await user.clear(screen.getByLabelText('Minimum quantity'))
    await user.type(screen.getByLabelText('Minimum quantity'), '1')
    await user.click(screen.getByRole('button', { name: 'Create product' }))

    await waitFor(() => expect(mock.history.post.length).toBe(1))
    const body = JSON.parse(mock.history.post[0].data as string) as Record<string, unknown>
    expect(body).toEqual({
      categoryId: '11111111-1111-4111-8111-111111111111',
      name: 'Ceramic Mug',
      slug: 'ceramic-mug',
      basePrice: 150,
      minQuantity: 1,
    })
  })

  it('edit mode with the product handed over via router state: pre-fills the form and PATCHes on save', async () => {
    const user = userEvent.setup()
    const product = buildProduct()
    mock.onPatch('/products/prod-1').reply(200, {
      success: true,
      data: { ...product, name: 'Ceramic Mug (Large Batch)' },
    })

    renderAt('/admin/products/prod-1', { product })

    expect(await screen.findByRole('heading', { name: 'Ceramic Mug' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Name')).toHaveValue('Ceramic Mug')
    expect(screen.getByLabelText('Base price')).toHaveValue(150)

    const nameField = screen.getByLabelText('Name')
    await user.clear(nameField)
    await user.type(nameField, 'Ceramic Mug (Large Batch)')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mock.history.patch.length).toBe(1))
    expect(await screen.findByRole('heading', { name: 'Ceramic Mug (Large Batch)' })).toBeInTheDocument()
  })

  it('without router state (direct navigation / refresh), fetches the product by id via GET /products/admin/:id', async () => {
    mock.onGet('/products/admin/prod-1').reply(200, { success: true, data: buildProduct() })

    renderAt('/admin/products/prod-1')

    expect(
      await screen.findByRole('heading', { name: 'Ceramic Mug' }),
    ).toBeInTheDocument()
  })

  it('without router state, a product that cannot be loaded shows an error and a link back to the list', async () => {
    mock.onGet('/products/admin/prod-1').reply(404, {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Product not found', details: [] },
    })

    renderAt('/admin/products/prod-1')

    expect(await screen.findByText('Product not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute(
      'href',
      '/admin/products',
    )
  })

  it('deactivating a product DELETEs it and stays on the page, offering Reactivate instead of navigating away', async () => {
    const user = userEvent.setup()
    const product = buildProduct()
    mock.onDelete('/products/prod-1').reply(200, { success: true, data: { message: 'Product deactivated' } })

    renderAt('/admin/products/prod-1', { product })

    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(mock.history.delete.length).toBe(1))
    // This used to navigate to the list, which was the dead end — a
    // deactivated product immediately stops appearing in GET /products,
    // so that navigation was a one-way trip. Staying here, with a
    // Reactivate action, is what closes it.
    expect(screen.queryByText('Products list page')).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Ceramic Mug' })).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument()
  })

  it('an already-inactive product shows Reactivate, not Deactivate', async () => {
    const product = buildProduct({ isActive: false })
    renderAt('/admin/products/prod-1', { product })

    await screen.findByRole('heading', { name: 'Ceramic Mug' })
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })

  it('reactivating POSTs to /products/:id/reactivate and flips the page back to showing Deactivate', async () => {
    const user = userEvent.setup()
    const product = buildProduct({ isActive: false })
    mock.onPost('/products/prod-1/reactivate').reply(200, {
      success: true,
      data: { message: 'Product reactivated' },
    })

    renderAt('/admin/products/prod-1', { product })

    await user.click(await screen.findByRole('button', { name: 'Reactivate' }))

    await waitFor(() => expect(mock.history.post.length).toBe(1))
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument()
  })

  it('adding a variant POSTs to /products/:id/variants and reflects it without a page refetch', async () => {
    const user = userEvent.setup()
    const product = buildProduct()
    mock.onPost('/products/prod-1/variants').reply(201, {
      success: true,
      data: {
        id: 'var-1',
        productId: 'prod-1',
        label: 'Large',
        priceDelta: '25.00',
        isAvailable: true,
        createdAt: '2026-08-27T00:00:00.000Z',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
    })

    renderAt('/admin/products/prod-1', { product })

    await screen.findByRole('heading', { name: 'Ceramic Mug' })
    await user.click(screen.getByRole('button', { name: 'Add variant' }))
    await user.type(screen.getByLabelText('Label'), 'Large')
    await user.click(screen.getByRole('button', { name: 'Add variant' }))

    await waitFor(() => expect(mock.history.post.length).toBe(1))
    expect(await screen.findByText('Large')).toBeInTheDocument()
  })

  it("moderates a review's status via the dropdown, PATCHing /admin/reviews/:id/status", async () => {
    const user = userEvent.setup()
    const product = buildProduct()
    mock.onGet('/products/prod-1/reviews').reply(200, {
      success: true,
      data: [
        {
          id: 'rev-1',
          productId: 'prod-1',
          userId: 'user-9',
          rating: 1,
          bodyText: 'Spam content',
          status: 'PUBLISHED',
          createdAt: '2026-08-27T00:00:00.000Z',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    })
    mock.onPatch('/admin/reviews/rev-1/status').reply(200, {
      success: true,
      data: {
        id: 'rev-1',
        productId: 'prod-1',
        userId: 'user-9',
        rating: 1,
        bodyText: 'Spam content',
        status: 'REMOVED',
        createdAt: '2026-08-27T00:00:00.000Z',
        updatedAt: '2026-08-27T00:00:01.000Z',
      },
    })

    renderAt('/admin/products/prod-1', { product })

    await screen.findByText('Spam content')
    await user.selectOptions(screen.getByLabelText('Status'), 'REMOVED')

    await waitFor(() => expect(mock.history.patch.length).toBe(1))
    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({ status: 'REMOVED' })
    // The row stays visible with its new status selected, rather than
    // vanishing — GET /products/:id/reviews is PUBLISHED-only and this
    // page never refetches it after a moderation write (see
    // ProductReviewModeration's own doc comment for why).
    expect(screen.getByText('Spam content')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toHaveValue('REMOVED')
  })

  it('shows an error and leaves the previous status selected when moderation is rejected', async () => {
    const user = userEvent.setup()
    const product = buildProduct()
    mock.onGet('/products/prod-1/reviews').reply(200, {
      success: true,
      data: [
        {
          id: 'rev-1',
          productId: 'prod-1',
          userId: 'user-9',
          rating: 4,
          bodyText: 'Fine review',
          status: 'PUBLISHED',
          createdAt: '2026-08-27T00:00:00.000Z',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    })
    mock.onPatch('/admin/reviews/rev-1/status').reply(500, {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', details: [] },
    })

    renderAt('/admin/products/prod-1', { product })

    await screen.findByText('Fine review')
    await user.selectOptions(screen.getByLabelText('Status'), 'REJECTED')

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument()
  })
})
