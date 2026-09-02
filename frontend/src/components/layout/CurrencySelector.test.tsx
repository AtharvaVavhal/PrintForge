import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CurrencySelector } from './CurrencySelector'

describe('CurrencySelector', () => {
  it('renders nothing while only one currency is configured (UX-20)', () => {
    const { container } = render(<CurrencySelector />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: 'Select currency' })).not.toBeInTheDocument()
  })
})
