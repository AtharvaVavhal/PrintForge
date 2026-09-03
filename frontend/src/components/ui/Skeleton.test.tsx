import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Skeleton } from './Skeleton'

afterEach(cleanup)

describe('Skeleton', () => {
  it('renders a bare, decorative placeholder when given no label', () => {
    const { container } = render(<Skeleton className="x" />)
    const block = container.firstElementChild as HTMLElement
    expect(block).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('announces a polite loading status carrying the label when one is given', () => {
    render(<Skeleton label="Loading product" />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Loading product')
  })

  it('hides the label text with the shared srOnly utility while keeping it in the a11y tree', () => {
    render(<Skeleton label="Loading product" />)
    // queryable by text → still in the accessibility tree
    const label = screen.getByText('Loading product')
    // hidden by the one shared utility class, not a per-module copy
    expect(label).toHaveClass('srOnly')
    expect(label.className).toBe('srOnly')
  })
})
