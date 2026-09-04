import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Banner } from '@/services/api/settings'
import { BannerGrid } from './BannerGrid'

afterEach(cleanup)

const banner = (overrides: Partial<Banner> = {}): Banner => ({
  imageUrl: 'https://cdn.example.test/a.jpg',
  title: 'Sitewide sale',
  text: 'Up to 20% off',
  link: '/products',
  ...overrides,
})

function renderGrid(banners: Banner[]) {
  return render(
    <MemoryRouter>
      <BannerGrid banners={banners} />
    </MemoryRouter>,
  )
}

describe('BannerGrid', () => {
  it('renders nothing when there are no banners', () => {
    const { container } = renderGrid([])
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one card per banner, with the title as an <h2>', () => {
    renderGrid([banner({ title: 'First' }), banner({ title: 'Second' })])

    const region = screen.getByRole('region', { name: /promotional banners/i })
    expect(within(region).getByRole('heading', { level: 2, name: 'First' })).toBeInTheDocument()
    expect(within(region).getByRole('heading', { level: 2, name: 'Second' })).toBeInTheDocument()
  })

  it('links the card when a link is provided and omits the link otherwise', () => {
    renderGrid([
      banner({ title: 'Linked', link: '/products?sort=newest' }),
      banner({ title: 'Unlinked', link: undefined }),
    ])

    expect(screen.getByRole('link', { name: /Linked/ })).toHaveAttribute(
      'href',
      '/products?sort=newest',
    )
    expect(screen.queryByRole('link', { name: /Unlinked/ })).not.toBeInTheDocument()
  })
})
