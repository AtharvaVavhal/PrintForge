import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { createTestQueryClient } from '@/test/test-utils'
import { formatDate } from '@/utils/formatDate'
import type { Product } from '@/types/catalog'
import { AdminProductDetailPage } from './AdminProductDetailPage'

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111'
const CATEGORIES_RESPONSE = {
  success: true,
  data: [{ id: CATEGORY_ID, name: 'Drinkware', slug: 'drinkware', parentCategoryId: null }],
}

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    categoryId: CATEGORY_ID,
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
    mock.onGet('/products/prod-1/reviews').reply(200, {
      success: true,
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
    })
  })

  afterEach(() => {
    mock.restore()
  })

  // ─── Create mode ───────────────────────────────────────────────────────

  it('create mode (/admin/products/new): renders an empty form and POSTs on submit', async () => {
    const user = userEvent.setup()
    mock.onPost('/products').reply(201, { success: true, data: buildProduct({ id: 'prod-new' }) })

    renderAt('/admin/products/new')

    expect(await screen.findByRole('heading', { level: 1, name: 'New product' })).toBeInTheDocument()
    await user.selectOptions(await screen.findByLabelText('Category'), CATEGORY_ID)
    await user.type(screen.getByLabelText('Name'), 'Ceramic Mug')
    await user.type(screen.getByLabelText('Slug'), 'ceramic-mug')
    await user.type(screen.getByLabelText('Base price'), '150')
    await user.clear(screen.getByLabelText('Minimum quantity'))
    await user.type(screen.getByLabelText('Minimum quantity'), '1')
    await user.click(screen.getByRole('button', { name: 'Create product' }))

    await waitFor(() => expect(mock.history.post).toHaveLength(1))
    expect(JSON.parse(mock.history.post[0].data as string)).toEqual({
      categoryId: CATEGORY_ID,
      name: 'Ceramic Mug',
      slug: 'ceramic-mug',
      basePrice: 150,
      minQuantity: 1,
    })
  })

  // ─── Edit mode: header + information ────────────────────────────────────

  it('renders exactly one h1 (the product name), a status badge, breadcrumb, and slug', async () => {
    const product = buildProduct()
    renderAt('/admin/products/prod-1', { product })

    await screen.findByRole('heading', { level: 1, name: 'Ceramic Mug' })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const header = screen.getByRole('heading', { level: 1 }).closest('header') as HTMLElement
    expect(within(header).getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Slug: ceramic-mug')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute('href', '/admin/products')
  })

  it('renders the product information card from real fields only', async () => {
    const product = buildProduct({
      basePrice: '299.50',
      minQuantity: 5,
      maxQuantity: 100,
      avgRating: '4.50',
      reviewCount: 12,
      specifications: { material: 'ceramic', capacityMl: 350 },
    })
    renderAt('/admin/products/prod-1', { product })

    const info = (await screen.findByText('Base price')).closest('dl') as HTMLElement
    expect(
      await within(within(info).getByText('Category').closest('div')!).findByText('Drinkware'),
    ).toBeInTheDocument()
    expect(within(within(info).getByText('Base price').closest('div')!).getByText('₹299.50')).toBeInTheDocument()
    expect(within(within(info).getByText('Minimum quantity').closest('div')!).getByText('5')).toBeInTheDocument()
    expect(within(within(info).getByText('Maximum quantity').closest('div')!).getByText('100')).toBeInTheDocument()
    expect(within(within(info).getByText('Rating').closest('div')!).getByText('4.50 · 12 reviews')).toBeInTheDocument()
    expect(within(within(info).getByText('Created').closest('div')!).getByText(formatDate('2026-08-27T00:00:00.000Z'))).toBeInTheDocument()
    expect(within(info).getByText('material')).toBeInTheDocument()
  })

  it('shows "No limit" and "No reviews yet" when those fields are absent', async () => {
    const product = buildProduct({ maxQuantity: null, avgRating: null })
    renderAt('/admin/products/prod-1', { product })

    const info = (await screen.findByText('Maximum quantity')).closest('dl') as HTMLElement
    expect(within(within(info).getByText('Maximum quantity').closest('div')!).getByText('No limit')).toBeInTheDocument()
    expect(within(within(info).getByText('Rating').closest('div')!).getByText('No reviews yet')).toBeInTheDocument()
  })

  // ─── Edit form ─────────────────────────────────────────────────────────

  it('edit mode via router state: pre-fills the form and PATCHes on save', async () => {
    const user = userEvent.setup()
    const product = buildProduct()
    mock.onPatch('/products/prod-1').reply(200, {
      success: true,
      data: { ...product, name: 'Ceramic Mug (Large Batch)' },
    })

    renderAt('/admin/products/prod-1', { product })

    expect(await screen.findByRole('heading', { level: 1, name: 'Ceramic Mug' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Name')).toHaveValue('Ceramic Mug')
    expect(screen.getByLabelText('Base price')).toHaveValue(150)

    const nameField = screen.getByLabelText('Name')
    await user.clear(nameField)
    await user.type(nameField, 'Ceramic Mug (Large Batch)')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ceramic Mug (Large Batch)' }),
    ).toBeInTheDocument()
  })

  it('renders the category control as a labelled select', async () => {
    renderAt('/admin/products/prod-1', { product: buildProduct() })

    const select = await screen.findByLabelText('Category')
    expect(select.tagName).toBe('SELECT')
    expect(within(select).getByRole('option', { name: 'Drinkware' })).toBeInTheDocument()
  })

  // ─── Loading / not found ───────────────────────────────────────────────

  it('shows a page-level skeleton (polite loading status) while fetching by id', () => {
    mock.onGet('/products/admin/prod-1').reply(() => new Promise(() => {}))
    renderAt('/admin/products/prod-1')

    expect(screen.getByText('Loading').closest('[role="status"]')).toBeInTheDocument()
    expect(screen.queryByText('Ceramic Mug')).not.toBeInTheDocument()
  })

  it('fetches the product by id via GET /products/admin/:id without router state', async () => {
    mock.onGet('/products/admin/prod-1').reply(200, { success: true, data: buildProduct() })
    renderAt('/admin/products/prod-1')

    expect(await screen.findByRole('heading', { level: 1, name: 'Ceramic Mug' })).toBeInTheDocument()
  })

  it('shows an error and a link back to the list when the product cannot be loaded', async () => {
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

  it('create mode: surfaces a categories fetch failure instead of a blank page', async () => {
    mock.reset()
    mock.onGet('/categories').reply(500, {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Categories unavailable', details: [] },
    })

    renderAt('/admin/products/new')

    expect(await screen.findByRole('heading', { level: 1, name: 'New product' })).toBeInTheDocument()
    expect(await screen.findByText('Categories unavailable')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Categories unavailable')
  })

  it('edit mode: surfaces a categories fetch failure in the Product details card', async () => {
    mock.reset()
    mock.onGet('/products/prod-1/reviews').reply(200, {
      success: true,
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
    })
    mock.onGet('/categories').reply(500, {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Categories unavailable', details: [] },
    })

    renderAt('/admin/products/prod-1', { product: buildProduct() })

    await screen.findByRole('heading', { level: 1, name: 'Ceramic Mug' })
    expect(await screen.findByText('Categories unavailable')).toBeInTheDocument()
    // The rest of the page (variants, images, reviews) still renders.
    expect(screen.getByRole('heading', { level: 2, name: 'Variants' })).toBeInTheDocument()
  })

  // ─── Status / deactivate ───────────────────────────────────────────────

  it('deactivates through a confirmation modal and stays on the page offering Reactivate', async () => {
    const user = userEvent.setup()
    mock
      .onDelete('/products/prod-1')
      .reply(200, { success: true, data: { message: 'Product deactivated' } })

    renderAt('/admin/products/prod-1', { product: buildProduct() })

    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))
    const dialog = screen.getByRole('dialog', { name: 'Deactivate this product?' })
    expect(mock.history.delete).toHaveLength(0)

    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(mock.history.delete).toHaveLength(1))
    expect(screen.queryByText('Products list page')).not.toBeInTheDocument()
    const header = screen.getByRole('heading', { level: 1 }).closest('header') as HTMLElement
    expect(within(header).getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument()
  })

  it('cancelling the deactivate confirmation does not call DELETE', async () => {
    const user = userEvent.setup()
    renderAt('/admin/products/prod-1', { product: buildProduct() })

    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep active' }),
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mock.history.delete).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
  })

  it('an already-inactive product shows Reactivate, not Deactivate', async () => {
    renderAt('/admin/products/prod-1', { product: buildProduct({ isActive: false }) })

    await screen.findByRole('heading', { level: 1, name: 'Ceramic Mug' })
    const header = screen.getByRole('heading', { level: 1 }).closest('header') as HTMLElement
    expect(within(header).getByText('Inactive')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })

  it('reactivating POSTs to /products/:id/reactivate immediately (no modal) and flips back to Deactivate', async () => {
    const user = userEvent.setup()
    mock
      .onPost('/products/prod-1/reactivate')
      .reply(200, { success: true, data: { message: 'Product reactivated' } })

    renderAt('/admin/products/prod-1', { product: buildProduct({ isActive: false }) })

    await user.click(await screen.findByRole('button', { name: 'Reactivate' }))

    await waitFor(() => expect(mock.history.post).toHaveLength(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
  })

  // ─── Variants ──────────────────────────────────────────────────────────

  it('shows an empty state when the product has no variants', async () => {
    renderAt('/admin/products/prod-1', { product: buildProduct() })

    expect(await screen.findByText('No variants yet')).toBeInTheDocument()
  })

  it('renders variants in a semantic table with real values', async () => {
    const product = buildProduct({
      variants: [
        {
          id: 'var-1',
          productId: 'prod-1',
          label: 'Large',
          priceDelta: '25.00',
          isAvailable: false,
          createdAt: '2026-08-27T00:00:00.000Z',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
      ],
    })
    renderAt('/admin/products/prod-1', { product })

    const table = await screen.findByRole('table', { name: 'Product variants' })
    expect(
      within(table).getAllByRole('columnheader').map((h) => h.textContent),
    ).toEqual(['Label', 'Price delta', 'Availability', 'Actions'])
    const row = within(table).getByText('Large').closest('tr') as HTMLElement
    expect(within(row).getByText('₹25.00')).toBeInTheDocument()
    expect(within(row).getByText('Unavailable')).toBeInTheDocument()
  })

  it('adds a variant via POST /products/:id/variants and reflects it without a page refetch', async () => {
    const user = userEvent.setup()
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

    renderAt('/admin/products/prod-1', { product: buildProduct() })

    await screen.findByRole('heading', { level: 1, name: 'Ceramic Mug' })
    await user.click(screen.getByRole('button', { name: 'Add variant' }))
    await user.type(screen.getByLabelText('Label'), 'Large')
    await user.click(screen.getByRole('button', { name: 'Add variant' }))

    await waitFor(() => expect(mock.history.post).toHaveLength(1))
    expect(await screen.findByText('Large')).toBeInTheDocument()
  })

  // ─── Customization fields ──────────────────────────────────────────────

  it('shows an empty state when the product has no customization fields', async () => {
    renderAt('/admin/products/prod-1', { product: buildProduct() })

    expect(await screen.findByText('No customization fields yet')).toBeInTheDocument()
  })

  it('renders customization fields in a semantic table with real values', async () => {
    const product = buildProduct({
      customizationFields: [
        {
          id: 'cf-1',
          productId: 'prod-1',
          label: 'Front text',
          type: 'TEXT',
          isRequired: true,
          sortOrder: 0,
          helpText: null,
          constraints: null,
          surchargeType: 'PER_CHARACTER',
          surchargeAmount: '2.00',
          createdAt: '2026-08-27T00:00:00.000Z',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
      ],
    })
    renderAt('/admin/products/prod-1', { product })

    const table = await screen.findByRole('table', { name: 'Product customization fields' })
    expect(
      within(table).getAllByRole('columnheader').map((h) => h.textContent),
    ).toEqual(['Label', 'Type', 'Required', 'Surcharge', 'Actions'])
    const row = within(table).getByText('Front text').closest('tr') as HTMLElement
    expect(within(row).getByText('Text')).toBeInTheDocument()
    expect(within(row).getByText('Required')).toBeInTheDocument()
    expect(within(row).getByText('Per character')).toBeInTheDocument()
  })

  // ─── Images ────────────────────────────────────────────────────────────

  it('shows an empty state when the product has no images', async () => {
    renderAt('/admin/products/prod-1', { product: buildProduct() })

    expect(await screen.findByText('No images yet')).toBeInTheDocument()
  })

  it('renders images and removes one through a confirmation modal', async () => {
    const user = userEvent.setup()
    const product = buildProduct({
      images: [
        {
          id: 'img-1',
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
    })
    mock.onDelete('/products/prod-1/images/img-1').reply(200, { success: true, data: null })

    renderAt('/admin/products/prod-1', { product })

    const img = await screen.findByRole('img', { name: 'Primary product image' })
    expect(img).toHaveAttribute('src', 'https://example.test/mug.jpg')

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove this image?' })
    expect(mock.history.delete).toHaveLength(0)

    await user.click(within(dialog).getByRole('button', { name: 'Remove image' }))
    await waitFor(() => expect(mock.history.delete).toHaveLength(1))
    expect(await screen.findByText('No images yet')).toBeInTheDocument()
  })

  // ─── Reviews (Step 3F component, integrated only) ───────────────────────

  it('keeps the redesigned review moderation section integrated', async () => {
    renderAt('/admin/products/prod-1', { product: buildProduct() })

    expect(await screen.findByRole('heading', { level: 2, name: 'Reviews' })).toBeInTheDocument()
    expect(await screen.findByText('No published reviews yet')).toBeInTheDocument()
  })

  it("moderates a review via the confirm modal, PATCHing /admin/reviews/:id/status", async () => {
    const user = userEvent.setup()
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
        status: 'REJECTED',
        createdAt: '2026-08-27T00:00:00.000Z',
        updatedAt: '2026-08-27T00:00:01.000Z',
      },
    })

    renderAt('/admin/products/prod-1', { product: buildProduct() })

    await screen.findByText('Spam content')
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Reject review' }),
    )

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({ status: 'REJECTED' })
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  // ─── Negative assertions ───────────────────────────────────────────────

  it('has no stock/SKU/analytics/chart UI and no raw JSON', async () => {
    renderAt('/admin/products/prod-1', { product: buildProduct() })

    await screen.findByRole('heading', { level: 1, name: 'Ceramic Mug' })
    expect(screen.queryByText(/^\{/)).not.toBeInTheDocument()
    expect(screen.queryByRole('figure')).not.toBeInTheDocument()
    expect(document.querySelector('canvas')).toBeNull()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/\bstock\b|\bSKU\b|inventory|warehouse|supplier|cost price|profit|margin|conversion rate/i),
    ).not.toBeInTheDocument()
    // Exactly one "Reviews" heading — the Step 3F component, not a duplicate.
    expect(screen.getAllByRole('heading', { name: 'Reviews' })).toHaveLength(1)
  })
})
