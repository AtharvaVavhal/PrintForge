import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Stars } from './Stars'

describe('Stars', () => {
  it('always renders five glyphs', () => {
    const { container } = render(<Stars value={3} />)
    expect(container.querySelectorAll('span > span')).toHaveLength(5)
  })

  it('rounds the value to the nearest whole star for the fill count', () => {
    const { container } = render(<Stars value={3.5} />)
    // 3.5 rounds to 4 filled glyphs.
    const glyphs = Array.from(container.querySelectorAll('span > span'))
    const filled = glyphs.filter((g) => g.className.includes('filled'))
    expect(filled).toHaveLength(4)
  })

  it('clamps out-of-range values into 0–5', () => {
    const { container: low } = render(<Stars value={-2} />)
    expect(low.querySelectorAll('[class*="filled"]')).toHaveLength(0)

    const { container: high } = render(<Stars value={99} />)
    expect(high.querySelectorAll('[class*="filled"]')).toHaveLength(5)
  })

  it('exposes an image role with the given accessible name', () => {
    render(<Stars value={4} aria-label="4 out of 5 stars" />)
    expect(screen.getByRole('img', { name: '4 out of 5 stars' })).toBeInTheDocument()
  })

  it('is decorative (aria-hidden, no role) when no label is given', () => {
    const { container } = render(<Stars value={4} />)
    const wrapper = container.firstElementChild
    expect(wrapper).toHaveAttribute('aria-hidden', 'true')
    expect(wrapper).not.toHaveAttribute('role')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('applies the compact modifier class', () => {
    const { container } = render(<Stars value={2} compact />)
    expect(container.firstElementChild?.className).toMatch(/compact/)
  })
})
