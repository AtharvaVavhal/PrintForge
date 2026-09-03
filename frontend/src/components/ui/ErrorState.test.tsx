import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PackageX } from 'lucide-react'
import { ErrorState } from './ErrorState'

afterEach(cleanup)

describe('ErrorState', () => {
  it('renders the title as an <h1> by default (the page primary heading)', () => {
    render(<ErrorState title="Order" message="Order not found" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Order' })).toBeInTheDocument()
  })

  it('renders the title as an <h2> when it sits beneath an existing page heading', () => {
    render(<ErrorState title="Couldn't load" titleAs="h2" message="Network error" />)
    expect(screen.getByRole('heading', { level: 2, name: "Couldn't load" })).toBeInTheDocument()
  })

  it('renders the message inside an assertive error Alert (preserved semantics)', () => {
    render(<ErrorState title="Product unavailable" message="Product not found" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Product not found')
  })

  it('renders an optional recovery action verbatim', () => {
    render(
      <ErrorState
        title="Order"
        message="Order not found"
        action={<a href="/orders">← All orders</a>}
      />,
    )
    const link = screen.getByRole('link', { name: '← All orders' })
    expect(link).toHaveAttribute('href', '/orders')
  })

  it('renders the optional icon hidden from assistive tech', () => {
    const { container } = render(
      <ErrorState title="Product unavailable" message="Not found" icon={PackageX} />,
    )
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('omits the icon and action nodes when not provided', () => {
    const { container } = render(<ErrorState title="Invoice" message="Not available" />)
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })

  it('does not add colour-only meaning — the state is conveyed by the heading and alert text', () => {
    render(<ErrorState title="Order" message="Order not found" />)
    // heading names the failure surface, alert text names the failure — both readable without colour
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Order')
    expect(screen.getByRole('alert')).toHaveTextContent('Order not found')
  })
})
