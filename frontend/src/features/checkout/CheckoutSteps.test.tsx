import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { CheckoutSteps } from './CheckoutSteps'

afterEach(cleanup)

describe('CheckoutSteps', () => {
  it('exposes an ordered, labelled progress list of the real checkout phases', () => {
    render(<CheckoutSteps current="details" />)

    const list = screen.getByRole('list', { name: 'Checkout progress' })
    expect(list.tagName).toBe('OL')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Delivery details')
    expect(items[1]).toHaveTextContent('Payment')
  })

  it('marks the current step with aria-current="step" and no other step', () => {
    render(<CheckoutSteps current="details" />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveAttribute('aria-current', 'step')
    expect(items[1]).not.toHaveAttribute('aria-current')
  })

  it('advances aria-current and marks the earlier step completed on the payment phase', () => {
    render(<CheckoutSteps current="payment" />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).not.toHaveAttribute('aria-current')
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    // state is conveyed by text, not colour alone
    expect(items[0]).toHaveTextContent('Completed:')
    expect(items[1]).toHaveTextContent('Current step:')
  })

  it('does not rely on colour alone — an upcoming step names its position', () => {
    render(<CheckoutSteps current="details" />)
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Step 2 of 2:')
  })

  it('renders no links or buttons — it is a status indicator, not navigation', () => {
    render(<CheckoutSteps current="details" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
