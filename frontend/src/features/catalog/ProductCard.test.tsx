import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { createMockAuthContext, renderWithProviders } from '@/test/test-utils'
import type { AuthContextValue } from '@/features/auth/authContext'
import type { CustomizationField, Product } from '@/types/catalog'
import { ProductCard } from './ProductCard'

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    categoryId: 'cat-1',
    name: 'Ceramic Mug',
    slug: 'ceramic-mug',
    basePrice: '150',
    minQuantity: 2,
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

function buildRequiredField(overrides: Partial<CustomizationField> = {}): CustomizationField {
  return {
    id: 'field-1',
    productId: 'prod-1',
    label: 'Engraving text',
    type: 'TEXT',
    isRequired: true,
    sortOrder: 0,
    helpText: null,
    constraints: null,
    surchargeType: 'NONE',
    surchargeAmount: '0.00',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const AUTHENTICATED = createMockAuthContext({
  status: 'authenticated',
  user: { id: 'user-1', email: 'shopper@example.test', role: 'CUSTOMER', createdAt: '2026-01-01T00:00:00.000Z' },
})

function renderProductCard(product: Product, authValue?: AuthContextValue) {
  return renderWithProviders(
    <Routes>
      <Route path="/grid" element={<ProductCard product={product} showQuickAdd />} />
      <Route path="/products/:slug" element={<div>PDP</div>} />
      <Route path="/login" element={<div>Login Page</div>} />
    </Routes>,
    { initialEntries: ['/grid'], authValue },
  )
}

describe('ProductCard', () => {
  it('renders a real <img> when the product has an image', () => {
    const product = buildProduct({
      images: [
        {
          id: 'img-1',
          productId: 'prod-1',
          cloudinaryPublicId: 'printforge/products/abc',
          resourceType: 'image',
          deliveryType: 'upload',
          url: 'https://res.cloudinary.com/demo/image/upload/abc.png',
          sortOrder: 0,
          isPrimary: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    renderWithProviders(<ProductCard product={product} />)

    const img = screen.getByRole('img', { name: 'Ceramic Mug' })
    expect(img).toHaveAttribute('src', 'https://res.cloudinary.com/demo/image/upload/abc.png')
  })

  it('renders the placeholder when the product has no images', () => {
    const product = buildProduct({ images: [] })

    renderWithProviders(<ProductCard product={product} />)

    expect(screen.queryByRole('img', { name: 'Ceramic Mug' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Ceramic Mug — no image available' }),
    ).toBeInTheDocument()
  })

  it('falls back to the placeholder when the image fails to load', () => {
    const product = buildProduct({
      images: [
        {
          id: 'img-1',
          productId: 'prod-1',
          cloudinaryPublicId: 'printforge/products/abc',
          resourceType: 'image',
          deliveryType: 'upload',
          url: 'https://res.cloudinary.com/demo/image/upload/broken.png',
          sortOrder: 0,
          isPrimary: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    renderWithProviders(<ProductCard product={product} />)

    const img = screen.getByRole('img', { name: 'Ceramic Mug' })
    fireEvent.error(img)

    expect(screen.queryByRole('img', { name: 'Ceramic Mug' })).not.toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Ceramic Mug — no image available' }),
    ).toBeInTheDocument()
  })

  describe('quick add', () => {
    let mock: MockAdapter

    beforeEach(() => {
      mock = new MockAdapter(apiClient)
    })

    afterEach(() => {
      mock.restore()
    })

    it('does not render a quick-add button when showQuickAdd is omitted', () => {
      renderWithProviders(<ProductCard product={buildProduct()} />)

      expect(screen.queryByRole('button', { name: 'Quick add' })).not.toBeInTheDocument()
    })

    it('renders a quick-add button for a simple product (no variants, no required customization)', () => {
      renderProductCard(buildProduct())

      expect(screen.getByRole('button', { name: 'Quick add' })).toBeInTheDocument()
    })

    it('omits the quick-add button when the product has variants, even with showQuickAdd', () => {
      const product = buildProduct({
        variants: [
          { id: 'var-1', productId: 'prod-1', label: 'Large', priceDelta: '20.00', isAvailable: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        ],
      })

      renderProductCard(product)

      expect(screen.queryByRole('button', { name: 'Quick add' })).not.toBeInTheDocument()
    })

    it('omits the quick-add button when the product has a required customization field', () => {
      const product = buildProduct({ customizationFields: [buildRequiredField()] })

      renderProductCard(product)

      expect(screen.queryByRole('button', { name: 'Quick add' })).not.toBeInTheDocument()
    })

    it('still renders the quick-add button when a customization field exists but is optional', () => {
      const product = buildProduct({
        customizationFields: [buildRequiredField({ id: 'field-2', isRequired: false })],
      })

      renderProductCard(product)

      expect(screen.getByRole('button', { name: 'Quick add' })).toBeInTheDocument()
    })

    it('adds product.minQuantity to the cart on click, without navigating to the PDP', async () => {
      const user = userEvent.setup()
      mock.onPost('/cart/items').reply(201, {
        success: true,
        data: { id: 'item-1', productId: 'prod-1', variantId: null, quantity: 2, unitPrice: '150.00', lineTotal: '300.00', customizations: [] },
        meta: { subtotal: '300.00', itemCount: 2 },
      })

      renderProductCard(buildProduct(), AUTHENTICATED)

      await user.click(screen.getByRole('button', { name: 'Quick add' }))

      expect(await screen.findByRole('button', { name: 'Added ✓' })).toBeInTheDocument()
      expect(mock.history.post).toHaveLength(1)
      expect(JSON.parse(mock.history.post[0].data as string)).toEqual({
        productId: 'prod-1',
        quantity: 2,
      })
      expect(screen.queryByText('PDP')).not.toBeInTheDocument()
    })

    it('redirects an unauthenticated click to /login without ever posting', async () => {
      const user = userEvent.setup()

      renderProductCard(buildProduct())

      await user.click(screen.getByRole('button', { name: 'Quick add' }))

      expect(await screen.findByText('Login Page')).toBeInTheDocument()
      expect(mock.history.post).toHaveLength(0)
    })
  })
})
