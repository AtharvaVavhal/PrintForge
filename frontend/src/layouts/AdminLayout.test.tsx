import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '@/features/auth/authContext'
import { createMockAuthContext } from '@/test/test-utils'
import { AdminLayout } from './AdminLayout'

const ADMIN = createMockAuthContext({
  status: 'authenticated',
  user: {
    id: 'admin-1',
    email: 'admin@example.test',
    role: 'ADMIN',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
})

function renderAdminLayout(
  initialPath = '/admin/orders',
  authValue = ADMIN,
) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<h1>Overview page</h1>} />
            <Route path="/admin/orders" element={<h1>Orders page</h1>} />
            <Route path="/admin/products" element={<h1>Products page</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

afterEach(cleanup)

describe('AdminLayout — shell', () => {
  it('renders the sidebar, topbar, and the matched page in <main>', () => {
    renderAdminLayout('/admin/orders')

    expect(screen.getByRole('complementary', { name: 'Admin' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    const main = screen.getByRole('main')
    expect(within(main).getByRole('heading', { name: 'Orders page' })).toBeInTheDocument()
  })

  it('exposes a skip link that targets the main content id', () => {
    renderAdminLayout()
    const skip = screen.getByRole('link', { name: /skip to main content/i })
    expect(skip).toHaveAttribute('href', '#admin-main-content')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'admin-main-content')
  })

  it('renders a "Back to store" link to the storefront home', () => {
    renderAdminLayout()
    expect(screen.getByRole('link', { name: /back to store/i })).toHaveAttribute('href', '/')
  })

  it('shows the signed-in admin identity and a logout action (real auth data only)', () => {
    renderAdminLayout()
    expect(screen.getByText('admin@example.test')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
  })

  it('does not render any storefront chrome (search, cart, mega-menu, announcement bar)', () => {
    renderAdminLayout()
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /cart/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: /product categories/i })).not.toBeInTheDocument()
  })
})

describe('AdminLayout — mobile drawer', () => {
  it('opens on the menu button, and the trigger reports its expanded state', async () => {
    const user = userEvent.setup()
    renderAdminLayout()

    const trigger = screen.getByRole('button', { name: /open admin menu/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-controls', 'admin-sidebar-nav')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    // The drawer's own close control becomes reachable.
    expect(screen.getByRole('button', { name: /close admin menu/i })).toBeInTheDocument()
  })

  it('closes on the in-drawer close button', async () => {
    const user = userEvent.setup()
    renderAdminLayout()
    const trigger = screen.getByRole('button', { name: /open admin menu/i })

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: /close admin menu/i }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderAdminLayout()
    const trigger = screen.getByRole('button', { name: /open admin menu/i })

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on a backdrop click', async () => {
    const user = userEvent.setup()
    const { container } = renderAdminLayout()
    const trigger = screen.getByRole('button', { name: /open admin menu/i })

    await user.click(trigger)
    const backdrop = container.querySelector('div[aria-hidden="true"]')
    expect(backdrop).not.toBeNull()
    await user.click(backdrop as Element)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes when a sidebar link is followed', async () => {
    const user = userEvent.setup()
    renderAdminLayout('/admin/orders')
    const trigger = screen.getByRole('button', { name: /open admin menu/i })

    await user.click(trigger)
    await user.click(screen.getByRole('link', { name: 'Products' }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('heading', { name: 'Products page' })).toBeInTheDocument()
  })
})
