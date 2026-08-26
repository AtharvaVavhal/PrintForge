import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { ProductDetailPage } from './ProductDetailPage'

const SAMPLE_PRODUCT = {
  id: 'prod-1',
  categoryId: 'cat-1',
  name: 'Ceramic Mug',
  slug: 'ceramic-mug',
  basePrice: '150',
  minQuantity: 1,
  maxQuantity: 10,
  specifications: { Material: 'Ceramic' },
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  variants: [
    { id: 'var-1', productId: 'prod-1', label: 'Large', priceDelta: '25', isAvailable: true, createdAt: '', updatedAt: '' },
    { id: 'var-2', productId: 'prod-1', label: 'Discontinued', priceDelta: '0', isAvailable: false, createdAt: '', updatedAt: '' },
  ],
  images: [],
  customizationFields: [],
}

const SAMPLE_IMAGE_URL = 'https://res.cloudinary.com/demo/image/upload/ceramic-mug.png'

function renderAtSlug(slug: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/products/:slug" element={<ProductDetailPage />} />
    </Routes>,
    { initialEntries: [`/products/${slug}`] },
  )
}

describe('ProductDetailPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  it("renders the product's name, price, specifications, and variants", async () => {
    mock.onGet('/products/ceramic-mug').reply(200, { success: true, data: SAMPLE_PRODUCT })

    renderAtSlug('ceramic-mug')

    expect(await screen.findByRole('heading', { name: 'Ceramic Mug' })).toBeInTheDocument()
    expect(screen.getByText('₹150.00')).toBeInTheDocument()
    expect(screen.getByText('Material')).toBeInTheDocument()
    expect(screen.getByText('Ceramic')).toBeInTheDocument()
    expect(screen.getByText('Large')).toBeInTheDocument()
    expect(screen.getByText('+₹25.00')).toBeInTheDocument()
    expect(screen.getByText('Discontinued')).toBeInTheDocument()
    expect(screen.getByText('· Unavailable')).toBeInTheDocument()
    // SAMPLE_PRODUCT has no images — a real, expected state, not an error.
    expect(
      screen.getByRole('img', { name: 'Ceramic Mug — no image available' }),
    ).toBeInTheDocument()
  })

  it('renders a real <img> when the product has an image', async () => {
    mock.onGet('/products/ceramic-mug').reply(200, {
      success: true,
      data: {
        ...SAMPLE_PRODUCT,
        images: [
          {
            id: 'img-1',
            productId: 'prod-1',
            cloudinaryPublicId: 'printforge/products/ceramic-mug',
            resourceType: 'image',
            deliveryType: 'upload',
            url: SAMPLE_IMAGE_URL,
            sortOrder: 0,
            isPrimary: true,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    })

    renderAtSlug('ceramic-mug')

    const img = await screen.findByRole('img', { name: 'Ceramic Mug' })
    expect(img).toHaveAttribute('src', SAMPLE_IMAGE_URL)
  })

  it('falls back to the placeholder when the image fails to load', async () => {
    mock.onGet('/products/ceramic-mug').reply(200, {
      success: true,
      data: {
        ...SAMPLE_PRODUCT,
        images: [
          {
            id: 'img-1',
            productId: 'prod-1',
            cloudinaryPublicId: 'printforge/products/ceramic-mug',
            resourceType: 'image',
            deliveryType: 'upload',
            url: SAMPLE_IMAGE_URL,
            sortOrder: 0,
            isPrimary: true,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    })

    renderAtSlug('ceramic-mug')

    const img = await screen.findByRole('img', { name: 'Ceramic Mug' })
    fireEvent.error(img)

    expect(screen.queryByRole('img', { name: 'Ceramic Mug' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Ceramic Mug — no image available' }),
    ).toBeInTheDocument()
  })

  it('renders an error state for a product that does not exist', async () => {
    mock.onGet('/products/does-not-exist').reply(404, {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Product not found', details: [] },
    })

    renderAtSlug('does-not-exist')

    expect(await screen.findByText('Product not found')).toBeInTheDocument()
  })
})
