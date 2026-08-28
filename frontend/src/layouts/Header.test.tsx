import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { createMockAuthContext, createTestQueryClient, renderWithProviders } from '@/test/test-utils'
import { Header } from './Header'

const CATEGORIES_RESPONSE = {
  success: true,
  data: [
    { id: 'cat-1', name: 'Mugs', slug: 'mugs', parentCategoryId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'cat-2', name: 'Tees', slug: 'tees', parentCategoryId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ],
}

describe('Header', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    mock.onGet('/cart').reply(200, { success: true, data: { id: 'cart-1', items: [], itemCount: 0, subtotal: '0.00' } })
    mock.onGet('/categories').reply(200, CATEGORIES_RESPONSE)
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

  it('renders an "All categories" link plus one link per category, each pointing at ?categoryId=<id>', async () => {
    renderWithProviders(<Header />, { authValue: createMockAuthContext({ status: 'unauthenticated' }) })

    const allLink = await screen.findByRole('link', { name: 'All categories' })
    expect(allLink).toHaveAttribute('href', '/products')

    const mugsLink = await screen.findByRole('link', { name: 'Mugs' })
    expect(mugsLink).toHaveAttribute('href', '/products?categoryId=cat-1')

    const teesLink = await screen.findByRole('link', { name: 'Tees' })
    expect(teesLink).toHaveAttribute('href', '/products?categoryId=cat-2')
  })

  it('hides the category strip entirely when there are zero categories', async () => {
    mock.onGet('/categories').reply(200, { success: true, data: [] })
    const queryClient = createTestQueryClient()

    renderWithProviders(<Header />, {
      authValue: createMockAuthContext({ status: 'unauthenticated' }),
      queryClient,
    })

    // Empty data hides the strip both before and after the fetch settles,
    // so assert against the query's actual resolved state (not just a
    // fixed tick) to prove this isn't just the pending-state default.
    await waitFor(() => {
      expect(queryClient.getQueryState(['categories'])?.status).toBe('success')
    })
    expect(screen.queryByRole('navigation', { name: 'Categories' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'All categories' })).not.toBeInTheDocument()
  })
})
