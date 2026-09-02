import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Breadcrumbs } from './Breadcrumbs'

function renderCrumbs(items: Parameters<typeof Breadcrumbs>[0]['items']) {
  return render(
    <MemoryRouter>
      <Breadcrumbs items={items} />
    </MemoryRouter>,
  )
}

describe('Breadcrumbs', () => {
  it('renders nothing for an empty trail', () => {
    const { container } = renderCrumbs([])
    expect(container).toBeEmptyDOMElement()
  })

  it('links every crumb except the last, which marks the current page', () => {
    renderCrumbs([
      { label: 'Home', to: '/' },
      { label: 'All products', to: '/products' },
      { label: 'Ceramic Mug' },
    ])

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'All products' })).toHaveAttribute('href', '/products')
    expect(screen.queryByRole('link', { name: 'Ceramic Mug' })).not.toBeInTheDocument()

    const current = screen.getByText('Ceramic Mug')
    expect(current).toHaveAttribute('aria-current', 'page')
  })

  it('does not link a crumb that has no destination', () => {
    renderCrumbs([{ label: 'Home', to: '/' }, { label: 'Search results' }])
    expect(screen.queryByRole('link', { name: 'Search results' })).not.toBeInTheDocument()
  })
})
