import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { CategoryTreeNode } from '@/types/catalog'
import { CategoryAccordion } from './CategoryAccordion'
import accordionSource from './CategoryAccordion.tsx?raw'

function node(id: string, name: string, children: CategoryTreeNode[] = []): CategoryTreeNode {
  return { id, name, slug: name.toLowerCase(), parentCategoryId: null, children }
}

function renderAccordion(categories: CategoryTreeNode[]) {
  return render(
    <MemoryRouter>
      <nav aria-label="Browse categories">
        <CategoryAccordion categories={categories} />
      </nav>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('CategoryAccordion (mobile)', () => {
  it('renders a flat category as a link to its PLP', () => {
    renderAccordion([node('c1', 'Mugs')])
    expect(screen.getByRole('link', { name: 'Mugs' })).toHaveAttribute('href', '/products?categoryId=c1')
  })

  it('renders a parent category as an accessible expand/collapse control', async () => {
    const user = userEvent.setup()
    renderAccordion([node('apparel', 'Apparel', [node('tees', 'T-Shirts'), node('hoodies', 'Hoodies')])])

    const trigger = screen.getByRole('button', { name: /Apparel/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-controls')

    // Collapsed: child links are in the DOM but the region is hidden.
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    const region = document.getElementById(trigger.getAttribute('aria-controls')!) as HTMLElement
    expect(within(region).getByRole('link', { name: 'All Apparel' })).toHaveAttribute('href', '/products?categoryId=apparel')
    expect(within(region).getByRole('link', { name: 'T-Shirts' })).toHaveAttribute('href', '/products?categoryId=tees')
    expect(within(region).getByRole('link', { name: 'Hoodies' })).toHaveAttribute('href', '/products?categoryId=hoodies')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders exactly the API categories with no name-based filtering', () => {
    renderAccordion([node('t', 'Smoke Test Category'), node('c1', 'Mugs')])
    expect(screen.getByRole('link', { name: 'Smoke Test Category' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mugs' })).toBeInTheDocument()

    expect(accordionSource).not.toMatch(/checkout test|smoke test|payments test|coupon smoke|mugs2/i)
    expect(accordionSource).not.toMatch(/\.filter\([^)]*\.(name|slug)/)
  })

  it('renders nothing for an empty category list', () => {
    const { container } = renderAccordion([])
    expect(within(container).queryByRole('link')).not.toBeInTheDocument()
  })
})
