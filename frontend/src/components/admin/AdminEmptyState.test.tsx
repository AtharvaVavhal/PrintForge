import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PackageSearch } from 'lucide-react'
import { AdminEmptyState } from './AdminEmptyState'

afterEach(cleanup)

describe('AdminEmptyState', () => {
  it('renders a title only', () => {
    render(<AdminEmptyState title="No orders yet" />)
    expect(screen.getByText('No orders yet')).toBeInTheDocument()
  })

  it('renders an optional description and action', () => {
    render(
      <AdminEmptyState
        title="No products yet"
        description="Add your first product to get started."
        action={<button>New product</button>}
      />,
    )
    expect(screen.getByText('Add your first product to get started.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New product' })).toBeInTheDocument()
  })

  it('renders an optional decorative icon that is hidden from assistive tech', () => {
    const { container } = render(<AdminEmptyState title="Nothing here" icon={PackageSearch} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})
