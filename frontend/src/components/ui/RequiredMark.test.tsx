import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RequiredMark } from './RequiredMark'

describe('RequiredMark', () => {
  it('renders a decorative asterisk that screen readers skip', () => {
    render(
      <span>
        Field label
        <RequiredMark />
      </span>,
    )
    const mark = screen.getByText('*')
    expect(mark.tagName).toBe('SPAN')
    // Purely visual — the field itself carries aria-required, so the glyph
    // must not be announced.
    expect(mark).toHaveAttribute('aria-hidden', 'true')
  })
})
