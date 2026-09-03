import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ShoppingCart } from 'lucide-react'
import { EmptyState } from './EmptyState'

afterEach(cleanup)

describe('EmptyState', () => {
  it('renders the title as an <h2> by default', () => {
    render(<EmptyState title="No orders yet" />)
    expect(screen.getByRole('heading', { level: 2, name: 'No orders yet' })).toBeInTheDocument()
  })

  it('renders the title as an <h1> when it is the page primary heading', () => {
    render(<EmptyState title="Your cart is empty" titleAs="h1" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Your cart is empty' })).toBeInTheDocument()
  })

  it('renders an optional description and action', () => {
    render(
      <EmptyState
        title="Your cart is empty"
        description="Browse the shop to find something to customize."
        action={<button>Browse the shop</button>}
      />,
    )
    expect(
      screen.getByText('Browse the shop to find something to customize.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse the shop' })).toBeInTheDocument()
  })

  it('renders the optional icon hidden from assistive tech', () => {
    const { container } = render(<EmptyState title="Empty" icon={ShoppingCart} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('omits description and action nodes when not provided', () => {
    const { container } = render(<EmptyState title="Nothing here" />)
    expect(container.querySelectorAll('p')).toHaveLength(0)
    expect(container.querySelector('button')).toBeNull()
  })
})
