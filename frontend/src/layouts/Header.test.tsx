import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { createMockAuthContext, renderWithProviders } from '@/test/test-utils'
import { Header } from './Header'

const ADMIN = {
  id: 'admin-1',
  email: 'admin@example.test',
  role: 'ADMIN' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
}
const CUSTOMER = {
  id: 'user-1',
  email: 'shopper@example.test',
  role: 'CUSTOMER' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('Header', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    mock
      .onGet('/cart')
      .reply(200, { success: true, data: { id: 'cart-1', items: [], itemCount: 0, subtotal: '0.00' } })
    mock.onGet('/categories/tree').reply(200, { success: true, data: [] })
  })

  afterEach(() => {
    mock.restore()
  })

  it('shows the Admin nav entry for an authenticated ADMIN user', () => {
    renderWithProviders(<Header />, {
      authValue: createMockAuthContext({ status: 'authenticated', user: ADMIN }),
    })
    expect(screen.getAllByRole('link', { name: 'Admin' }).length).toBeGreaterThan(0)
  })

  it('never shows the Admin nav entry to a logged-in CUSTOMER, not even as a dead link', () => {
    renderWithProviders(<Header />, {
      authValue: createMockAuthContext({ status: 'authenticated', user: CUSTOMER }),
    })
    expect(screen.queryAllByRole('link', { name: 'Admin' })).toHaveLength(0)
  })

  it('does not show the Admin nav entry to an unauthenticated visitor', () => {
    renderWithProviders(<Header />, { authValue: createMockAuthContext({ status: 'unauthenticated' }) })
    expect(screen.queryAllByRole('link', { name: 'Admin' })).toHaveLength(0)
  })

  it('does not print the raw account email in the header', () => {
    renderWithProviders(<Header />, {
      authValue: createMockAuthContext({ status: 'authenticated', user: CUSTOMER }),
    })
    expect(screen.queryByText(CUSTOMER.email)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account')
  })

  it('keeps the cart reachable for a signed-out visitor', () => {
    renderWithProviders(<Header />, { authValue: createMockAuthContext({ status: 'unauthenticated' }) })
    expect(screen.getByRole('link', { name: /cart/i })).toHaveAttribute('href', '/cart')
  })

  it('renders a product search in the bar and inside the mobile nav drawer', () => {
    renderWithProviders(<Header />, { authValue: createMockAuthContext({ status: 'unauthenticated' }) })

    // Both are always in the DOM; CSS shows the right one per breakpoint.
    expect(screen.getAllByRole('search', { hidden: true })).toHaveLength(2)

    const drawer = document.getElementById('mobile-nav') as HTMLElement
    expect(within(drawer).getByRole('search', { hidden: true })).toBeInTheDocument()
    expect(
      within(drawer).getByPlaceholderText('Search products…'),
    ).toBeInTheDocument()
  })
})
