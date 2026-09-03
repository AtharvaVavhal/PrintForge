import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import { ForbiddenPage } from './ForbiddenPage'

describe('ForbiddenPage', () => {
  it('has one meaningful page <h1> (UX-14)', () => {
    renderWithProviders(<ForbiddenPage />)

    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent('Not authorised')
  })

  it('keeps a link back to the home page', () => {
    renderWithProviders(<ForbiddenPage />)

    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
  })
})
