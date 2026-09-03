import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AdminPageSkeleton } from './AdminPageSkeleton'

afterEach(cleanup)

describe('AdminPageSkeleton', () => {
  it('renders a polite, labelled loading region (announced to assistive tech)', () => {
    render(<AdminPageSkeleton />)
    const region = screen.getByRole('status')
    expect(region).toHaveTextContent('Loading')
    // the label is visually hidden via the shared utility, not shown on screen
    expect(screen.getByText('Loading')).toHaveClass('srOnly')
  })

  it('renders the requested number of content blocks (plus the header placeholders)', () => {
    const { container } = render(<AdminPageSkeleton rows={5} />)
    // Skeleton primitives are aria-hidden divs.
    const blocks = container.querySelectorAll('[aria-hidden="true"]')
    // 2 header placeholders (title + action) + 5 content blocks.
    expect(blocks).toHaveLength(7)
  })
})
