import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AdminCard } from './AdminCard'

afterEach(cleanup)

describe('AdminCard', () => {
  it('renders its children', () => {
    render(
      <AdminCard>
        <p>card content</p>
      </AdminCard>,
    )
    expect(screen.getByText('card content')).toBeInTheDocument()
  })

  it('renders an optional title as an <h2> and optional actions', () => {
    render(
      <AdminCard title="Shipping to" actions={<button>Edit</button>}>
        <p>123 Test St</p>
      </AdminCard>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Shipping to' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('renders no header when neither title nor actions are given', () => {
    render(
      <AdminCard>
        <p>x</p>
      </AdminCard>,
    )
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('can render as a <section> for a titled region', () => {
    render(
      <AdminCard as="section" title="Payment summary">
        <p>total</p>
      </AdminCard>,
    )
    // A <section> with an accessible name is a "region" landmark.
    expect(screen.getByRole('region', { name: 'Payment summary' })).toBeInTheDocument()
  })
})
