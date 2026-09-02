import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ProductImage } from '@/types/catalog'
import { ProductGallery } from './ProductGallery'

function image(overrides: Partial<ProductImage> = {}): ProductImage {
  return {
    id: 'img-1',
    productId: 'p1',
    cloudinaryPublicId: 'x',
    resourceType: 'image',
    deliveryType: 'upload',
    url: 'https://cdn.test/1.png',
    sortOrder: 0,
    isPrimary: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('ProductGallery', () => {
  it('shows the placeholder when there are no images', () => {
    render(<ProductGallery images={[]} label="Ceramic Mug" />)
    expect(
      screen.getByRole('img', { name: 'Ceramic Mug — no image available' }),
    ).toBeInTheDocument()
  })

  it('renders the primary image first and no thumbnails for a single image', () => {
    render(
      <ProductGallery
        images={[image({ id: 'a', url: 'https://cdn.test/a.png', isPrimary: true })]}
        label="Ceramic Mug"
      />,
    )
    expect(screen.getByRole('img', { name: 'Ceramic Mug' })).toHaveAttribute(
      'src',
      'https://cdn.test/a.png',
    )
    expect(screen.queryByRole('list', { name: 'Product images' })).not.toBeInTheDocument()
  })

  it('switches the main image when a thumbnail is activated', () => {
    render(
      <ProductGallery
        images={[
          image({ id: 'a', url: 'https://cdn.test/a.png', isPrimary: true, sortOrder: 0 }),
          image({ id: 'b', url: 'https://cdn.test/b.png', sortOrder: 1 }),
        ]}
        label="Ceramic Mug"
      />,
    )
    expect(screen.getByRole('img', { name: 'Ceramic Mug' })).toHaveAttribute('src', 'https://cdn.test/a.png')

    fireEvent.click(screen.getByRole('button', { name: 'Show image 2 of 2' }))
    expect(screen.getByRole('img', { name: 'Ceramic Mug' })).toHaveAttribute('src', 'https://cdn.test/b.png')
  })

  it('drops an image that fails to load and falls back to the placeholder when none remain', () => {
    render(
      <ProductGallery
        images={[image({ id: 'a', url: 'https://cdn.test/broken.png', isPrimary: true })]}
        label="Ceramic Mug"
      />,
    )
    fireEvent.error(screen.getByRole('img', { name: 'Ceramic Mug' }))
    expect(
      screen.getByRole('img', { name: 'Ceramic Mug — no image available' }),
    ).toBeInTheDocument()
  })
})
