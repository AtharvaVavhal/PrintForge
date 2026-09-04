import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ShowcaseCategory } from '@/services/api/settings'
import { CategoryShowcase } from './CategoryShowcase'

afterEach(cleanup)

const showcaseCategory = (overrides: Partial<ShowcaseCategory> = {}): ShowcaseCategory => ({
  categoryId: 'cat-1',
  imageUrl: 'https://cdn.example.test/a.jpg',
  title: 'Mugs',
  ...overrides,
})

function renderShowcase(categories: ShowcaseCategory[]) {
  return render(
    <MemoryRouter>
      <CategoryShowcase categories={categories} />
    </MemoryRouter>,
  )
}

describe('CategoryShowcase', () => {
  it('renders nothing when there are no categories', () => {
    const { container } = renderShowcase([])
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one linked card per category, pointing at the catalog filtered by id', () => {
    renderShowcase([
      showcaseCategory({ categoryId: 'c1', title: 'Mugs' }),
      showcaseCategory({ categoryId: 'c2', title: 'Apparel' }),
    ])

    const region = screen.getByRole('region', { name: /shop by category/i })
    expect(within(region).getByRole('link', { name: /Shop Mugs/i })).toHaveAttribute(
      'href',
      '/products?categoryId=c1',
    )
    expect(within(region).getByRole('link', { name: /Shop Apparel/i })).toHaveAttribute(
      'href',
      '/products?categoryId=c2',
    )
    expect(within(region).getByRole('heading', { level: 3, name: 'Mugs' })).toBeInTheDocument()
  })
})
