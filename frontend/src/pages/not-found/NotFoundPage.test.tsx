import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import { NotFoundPage } from './NotFoundPage'

describe('NotFoundPage', () => {
  it('has one meaningful page <h1> (UX-14)', () => {
    renderWithProviders(<NotFoundPage />)

    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent('Page not found')
  })

  it('keeps a link back to the home page', () => {
    renderWithProviders(<NotFoundPage />)

    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
  })
})
