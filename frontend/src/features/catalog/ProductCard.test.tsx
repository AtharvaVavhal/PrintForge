import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import type { Product } from '@/types/catalog'
import { ProductCard } from './ProductCard'

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    categoryId: 'cat-1',
    name: 'Ceramic Mug',
    slug: 'ceramic-mug',
    basePrice: '150',
    minQuantity: 1,
    maxQuantity: null,
    specifications: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    variants: [],
    images: [],
    customizationFields: [],
    ...overrides,
  }
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
})
