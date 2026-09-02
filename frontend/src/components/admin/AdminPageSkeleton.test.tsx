import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AdminPageSkeleton } from './AdminPageSkeleton'

afterEach(cleanup)

describe('AdminPageSkeleton', () => {
  it('renders a busy, labelled loading region', () => {
    render(<AdminPageSkeleton />)
    const region = screen.getByLabelText('Loading')
    expect(region).toHaveAttribute('aria-busy', 'true')
  })

  it('renders the requested number of content blocks (plus the header placeholders)', () => {
    const { container } = render(<AdminPageSkeleton rows={5} />)
    // Skeleton primitives are aria-hidden divs.
    const blocks = container.querySelectorAll('[aria-hidden="true"]')
    // 2 header placeholders (title + action) + 5 content blocks.
    expect(blocks).toHaveLength(7)
  })
})
