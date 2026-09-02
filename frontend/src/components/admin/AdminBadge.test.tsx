import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AdminBadge, type AdminBadgeVariant } from './AdminBadge'

afterEach(cleanup)

const VARIANTS: AdminBadgeVariant[] = ['success', 'warning', 'danger', 'info', 'neutral']

describe('AdminBadge', () => {
  it('renders the caller-supplied label (no business labels baked in)', () => {
    render(<AdminBadge variant="success">Payment confirmed</AdminBadge>)
    expect(screen.getByText('Payment confirmed')).toBeInTheDocument()
  })

  it('defaults to the neutral variant', () => {
    render(<AdminBadge>Draft</AdminBadge>)
    // The wrapper carries a data-variant attribute for styling / assertion.
    expect(screen.getByText('Draft').closest('[data-variant]')).toHaveAttribute(
      'data-variant',
      'neutral',
    )
  })

  it('carries a non-color cue — a distinct aria-hidden icon per variant', () => {
    for (const variant of VARIANTS) {
      const { container, unmount } = render(
        <AdminBadge variant={variant}>{variant}</AdminBadge>,
      )
      const svg = container.querySelector('svg')
      expect(svg, `${variant} icon`).not.toBeNull()
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      unmount()
    }
  })

  it('exposes each variant via data-variant', () => {
    for (const variant of VARIANTS) {
      const { unmount } = render(<AdminBadge variant={variant}>x</AdminBadge>)
      expect(screen.getByText('x').closest('[data-variant]')).toHaveAttribute(
        'data-variant',
        variant,
      )
      unmount()
    }
  })
})
