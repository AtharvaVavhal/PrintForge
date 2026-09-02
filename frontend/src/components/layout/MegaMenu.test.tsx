import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { CategoryTreeNode } from '@/types/catalog'
import { MegaMenuBar } from './MegaMenu'
import megaMenuSource from './MegaMenu.tsx?raw'

function node(id: string, name: string, children: CategoryTreeNode[] = []): CategoryTreeNode {
  return { id, name, slug: name.toLowerCase().replace(/\s+/g, '-'), parentCategoryId: null, children }
}

function renderBar(categories: CategoryTreeNode[], entries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <nav aria-label="Product categories">
        <MegaMenuBar categories={categories} />
      </nav>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('MegaMenuBar — data honesty', () => {
  it('renders exactly the categories the API returns, and nothing else', () => {
    renderBar([node('c1', 'Mugs'), node('c2', 'Tees')])

    expect(screen.getByRole('link', { name: 'Mugs' })).toHaveAttribute('href', '/products?categoryId=c1')
    expect(screen.getByRole('link', { name: 'Tees' })).toHaveAttribute('href', '/products?categoryId=c2')
    // "All" shortcut + the two categories — no injected/hardcoded entries.
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['All', 'Mugs', 'Tees'])
  })

  it('does NOT filter categories by name — a still-active "Checkout Test" row would render as-is', () => {
    // Proves the fix is data-driven: if the DB marks a test category active,
    // the frontend shows it (cleanup is an admin/data task, not code).
    renderBar([node('t', 'Checkout Test'), node('c1', 'Mugs')])
    expect(screen.getByRole('link', { name: 'Checkout Test' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mugs' })).toBeInTheDocument()
  })

  it('has no test/dev category names or name-based filtering hardcoded in the component source', () => {
    expect(megaMenuSource).not.toMatch(/checkout test|smoke test|payments test|coupon smoke|mugs2/i)
    // No name/slug allow/deny-listing of any kind.
    expect(megaMenuSource).not.toMatch(/\.filter\([^)]*\.name/)
    expect(megaMenuSource).not.toMatch(/\.filter\([^)]*\.slug/)
  })

  it('falls back to a single "All products" link when there are no categories (empty / error state)', () => {
    renderBar([])
    expect(screen.getByRole('link', { name: 'All products' })).toHaveAttribute('href', '/products')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('MegaMenuBar — hierarchy + interaction', () => {
  const TREE = [
    node('apparel', 'Apparel', [
      node('tees', 'T-Shirts', [node('tees-graphic', 'Graphic')]),
      node('hoodies', 'Hoodies'),
    ]),
    node('mugs', 'Mugs'),
  ]

  it('renders a flat category as a link and a parent category as a disclosure button', () => {
    renderBar(TREE)
    expect(screen.getByRole('link', { name: 'Mugs' })).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: /Apparel/ })
    expect(trigger).toHaveAttribute('aria-haspopup', 'true')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens the dropdown on click, revealing child + grandchild links and an "All Apparel" link', async () => {
    const user = userEvent.setup()
    renderBar(TREE)

    await user.click(screen.getByRole('button', { name: /Apparel/ }))

    expect(screen.getByRole('button', { name: /Apparel/ })).toHaveAttribute('aria-expanded', 'true')
    const panel = document.getElementById('megamenu-apparel') as HTMLElement
    expect(within(panel).getByRole('link', { name: 'All Apparel' })).toHaveAttribute('href', '/products?categoryId=apparel')
    expect(within(panel).getByRole('link', { name: 'T-Shirts' })).toHaveAttribute('href', '/products?categoryId=tees')
    expect(within(panel).getByRole('link', { name: 'Hoodies' })).toHaveAttribute('href', '/products?categoryId=hoodies')
    expect(within(panel).getByRole('link', { name: 'Graphic' })).toHaveAttribute('href', '/products?categoryId=tees-graphic')
  })

  it('closes the open dropdown on Escape and on an outside click', async () => {
    const user = userEvent.setup()
    renderBar(TREE)
    const trigger = screen.getByRole('button', { name: /Apparel/ })

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await user.click(document.body)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('highlights the active top-level entry when a child category page is open', () => {
    renderBar(TREE, ['/products?categoryId=hoodies'])
    // Apparel is the parent of the active "hoodies" category.
    expect(screen.getByRole('button', { name: /Apparel/ }).className).toMatch(/linkActive/)
  })

  it('keeps the parent category reachable — its own PLP link is inside the panel', async () => {
    const user = userEvent.setup()
    renderBar(TREE)
    await user.click(screen.getByRole('button', { name: /Apparel/ }))
    const panel = document.getElementById('megamenu-apparel') as HTMLElement
    expect(within(panel).getByRole('link', { name: 'All Apparel' })).toBeInTheDocument()
  })
})
