import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { AuthContext } from '@/features/auth/authContext'
import { ToastProvider } from '@/components/ui/toast/ToastProvider'
import {
  createMockAuthContext,
  createTestQueryClient,
  renderWithProviders,
} from '@/test/test-utils'
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
    // Default: backend serves the "PrintForge" default until an owner
    // configures a store name.
    mock.onGet('/settings/storeName').reply(200, { success: true, data: { value: 'PrintForge' } })
  })

  afterEach(() => {
    mock.restore()
  })

  it('renders the configured store name as the brand (UX — Store Identity)', async () => {
    mock.onGet('/settings/storeName').reply(200, { success: true, data: { value: 'Atharva Prints' } })
    renderWithProviders(<Header />, { authValue: createMockAuthContext({ status: 'unauthenticated' }) })

    const brand = await screen.findByRole('link', { name: 'Atharva Prints home' })
    expect(brand).toHaveTextContent('Atharva Prints')
    expect(brand).toHaveAttribute('href', '/')
    expect(screen.queryByText('PrintForge')).not.toBeInTheDocument()
  })

  it('falls back to "PrintForge" as the brand when the store-name endpoint fails', async () => {
    mock.onGet('/settings/storeName').reply(500)
    renderWithProviders(<Header />, { authValue: createMockAuthContext({ status: 'unauthenticated' }) })

    // The brand link is always "<name> home" — starts as the fallback and
    // stays there because the request errored.
    expect(await screen.findByRole('link', { name: 'PrintForge home' })).toHaveTextContent(
      'PrintForge',
    )
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

  it('keeps the category-nav loading placeholder decorative — no bogus "Loading categories" announcement', async () => {
    mock.resetHandlers()
    mock.onGet('/cart').reply(200, { success: true, data: { id: 'c', items: [], itemCount: 0, subtotal: '0.00' } })
    mock.onGet('/settings/storeName').reply(200, { success: true, data: { value: 'PrintForge' } })
    mock.onGet('/categories/tree').reply(() => new Promise(() => {})) // never settles → stays in the loading branch

    renderWithProviders(<Header />, { authValue: createMockAuthContext({ status: 'unauthenticated' }) })

    // The category bar is still a labelled landmark while its contents load…
    expect(await screen.findByRole('navigation', { name: 'Product categories' })).toBeInTheDocument()
    // …but the shimmer placeholder is hidden from assistive tech, matching
    // the homepage rails — it is not a live region and carries no label.
    expect(screen.queryByLabelText('Loading categories')).not.toBeInTheDocument()
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

  it('exposes account + orders + log out inside the nav drawer for an authenticated user (UX-16)', () => {
    renderWithProviders(<Header />, {
      authValue: createMockAuthContext({ status: 'authenticated', user: CUSTOMER }),
    })
    const drawer = document.getElementById('mobile-nav') as HTMLElement
    // The drawer is always in the DOM; CSS toggles it open per breakpoint.
    expect(within(drawer).getByRole('link', { name: 'My account', hidden: true })).toBeInTheDocument()
    expect(within(drawer).getByRole('link', { name: 'My orders', hidden: true })).toBeInTheDocument()
    // The auth cluster now collapses into the drawer below 560px, so logout
    // must be reachable there and not only in the top row.
    expect(
      within(drawer).getByRole('button', { name: 'Log out', hidden: true }),
    ).toBeInTheDocument()
  })

  it('keeps Log in / Create an account inside the nav drawer for a signed-out visitor (UX-16)', () => {
    renderWithProviders(<Header />, { authValue: createMockAuthContext({ status: 'unauthenticated' }) })
    const drawer = document.getElementById('mobile-nav') as HTMLElement
    expect(
      within(drawer).getByRole('link', { name: 'Log in', hidden: true }),
    ).toHaveAttribute('href', '/login')
    expect(
      within(drawer).getByRole('link', { name: 'Create an account', hidden: true }),
    ).toHaveAttribute('href', '/register')
  })

  it('logs out from the drawer and collapses it afterwards (UX-16)', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    renderWithProviders(<Header />, {
      authValue: createMockAuthContext({ status: 'authenticated', user: CUSTOMER, logout }),
    })

    // Open the drawer (its trigger is display:none in jsdom — media queries
    // aren't evaluated — so drive it with fireEvent).
    const menuButton = screen.getByLabelText('Open menu')
    fireEvent.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')

    const drawer = document.getElementById('mobile-nav') as HTMLElement
    fireEvent.click(within(drawer).getByRole('button', { name: 'Log out', hidden: true }))

    expect(logout).toHaveBeenCalledTimes(1)
    // onAfterLogout runs once logout resolves and collapses the drawer.
    await vi.waitFor(() => expect(menuButton).toHaveAttribute('aria-expanded', 'false'))
  })

  it('carries the current storefront location as state.from on the "Sign up" link (UX-04)', async () => {
    const user = userEvent.setup()
    function StateEcho() {
      const loc = useLocation()
      return <div data-testid="reg-state">{JSON.stringify(loc.state)}</div>
    }
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AuthContext.Provider value={createMockAuthContext({ status: 'unauthenticated' })}>
          <MemoryRouter initialEntries={['/products?category=mugs']}>
            <ToastProvider>
              <Header />
              <Routes>
                <Route path="/products" element={<div>catalog</div>} />
                <Route path="/register" element={<StateEcho />} />
              </Routes>
            </ToastProvider>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )

    // desktop header "Sign up" (the drawer one reads "Create an account")
    await user.click(screen.getByRole('link', { name: 'Sign up' }))

    const state = JSON.parse(
      screen.getByTestId('reg-state').textContent || 'null',
    ) as { from?: { pathname?: string; search?: string } } | null
    expect(state?.from?.pathname).toBe('/products')
    expect(state?.from?.search).toBe('?category=mugs')
  })

  it('omits state.from on "Sign up" when the header is already on an auth page', async () => {
    const user = userEvent.setup()
    function StateEcho() {
      const loc = useLocation()
      return <div data-testid="reg-state">{JSON.stringify(loc.state)}</div>
    }
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AuthContext.Provider value={createMockAuthContext({ status: 'unauthenticated' })}>
          <MemoryRouter initialEntries={['/login']}>
            <ToastProvider>
              <Header />
              <Routes>
                <Route path="/login" element={<div>login</div>} />
                <Route path="/register" element={<StateEcho />} />
              </Routes>
            </ToastProvider>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('link', { name: 'Sign up' }))
    expect(screen.getByTestId('reg-state').textContent).toBe('null')
  })
})
