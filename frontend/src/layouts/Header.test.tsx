import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { createMockAuthContext, renderWithProviders } from '@/test/test-utils'
import { Header } from './Header'

describe('Header', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    mock.onGet('/cart').reply(200, { success: true, data: { id: 'cart-1', items: [], itemCount: 0, subtotal: '0.00' } })
  })

  afterEach(() => {
    mock.restore()
  })

  it('shows the Admin nav entry for an authenticated ADMIN user', () => {
    renderWithProviders(<Header />, {
      authValue: createMockAuthContext({
        status: 'authenticated',
        user: { id: 'admin-1', email: 'admin@example.test', role: 'ADMIN', createdAt: '2026-01-01T00:00:00.000Z' },
      }),
    })

    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument()
  })

  it('never shows the Admin nav entry to a logged-in CUSTOMER, not even as a dead link', () => {
    renderWithProviders(<Header />, {
      authValue: createMockAuthContext({
        status: 'authenticated',
        user: { id: 'user-1', email: 'shopper@example.test', role: 'CUSTOMER', createdAt: '2026-01-01T00:00:00.000Z' },
      }),
    })

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('does not show the Admin nav entry to an unauthenticated visitor', () => {
    renderWithProviders(<Header />, { authValue: createMockAuthContext({ status: 'unauthenticated' }) })

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })
})
