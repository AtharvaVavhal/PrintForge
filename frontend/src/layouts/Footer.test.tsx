import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Footer } from './Footer'

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  )
}

describe('Footer', () => {
  it('links the real legal and company pages', () => {
    renderFooter()
    const expected: [string, string][] = [
      ['About', '/about'],
      ['Contact', '/contact'],
      ['Privacy', '/privacy'],
      ['Terms', '/terms'],
      ['Refund Policy', '/refund-policy'],
      ['All products', '/products'],
    ]
    for (const [name, href] of expected) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
    }
  })

  it('does not fabricate business contact details, social accounts, or certifications', () => {
    const { container } = renderFooter()
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\+91|\bphone\b|@printforge\.(com|in)/i)
    expect(text).not.toMatch(/facebook|instagram|twitter|linkedin|youtube/i)
    expect(text).not.toMatch(/ISO\s?\d|PCI|certified|GSTIN/i)
    expect(screen.queryByRole('link', { name: /facebook|instagram|twitter/i })).not.toBeInTheDocument()
  })
})
