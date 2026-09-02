import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { createTestQueryClient } from '@/test/test-utils'
import { formatDate } from '@/utils/formatDate'
import { AdminCustomerDetailPage } from './AdminCustomerDetailPage'

function buildCustomer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cust-1',
    email: 'shopper@example.test',
    addressLine1: '221B Baker St',
    addressLine2: null,
    city: 'London',
    state: 'LDN',
    postalCode: 'NW16XE',
    country: 'UK',
    phone: '9876543210',
    role: 'CUSTOMER',
    isActive: true,
    createdAt: '2026-08-27T14:47:50.813Z',
    orderCount: 2,
    totalSpend: '498.00',
    recentOrders: [
      {
        id: 'order-1',
        orderNumber: 'PF-000001',
        status: 'PAID',
        total: '249.00',
        currency: 'INR',
        itemCount: 1,
        needsManualRefund: false,
        createdAt: '2026-08-27T14:27:57.215Z',
      },
    ],
    ...overrides,
  }
}

function renderPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/customers/cust-1']}>
        <Routes>
          <Route path="/admin/customers/:id" element={<AdminCustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function reply(mock: MockAdapter, overrides: Partial<Record<string, unknown>> = {}) {
  mock.onGet('/admin/customers/cust-1').reply(200, { success: true, data: buildCustomer(overrides) })
}

describe('AdminCustomerDetailPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  // ─── Preserved behaviour ───────────────────────────────────────────────

  it('renders the customer, metrics, address and recent orders — read-only, no edit controls', async () => {
    reply(mock)
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'shopper@example.test' })).toBeInTheDocument()

    const orders = screen.getByRole('region', { name: 'Orders' })
    expect(within(orders).getByText('2')).toBeInTheDocument()
    const spend = screen.getByRole('region', { name: 'Total spend' })
    expect(within(spend).getByText('₹498.00')).toBeInTheDocument()

    expect(screen.getByText(/221B Baker St/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /PF-000001/ })).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows "No address on file" when the customer has none', async () => {
    reply(mock, {
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      phone: null,
    })
    renderPage()

    expect(await screen.findByText('No address on file.')).toBeInTheDocument()
  })

  // ─── Redesign structure ────────────────────────────────────────────────

  it('renders exactly one h1 (the email) plus the joined date', async () => {
    reply(mock)
    renderPage()

    await screen.findByText('221B Baker St')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('shopper@example.test')
    expect(
      screen.getByText(`Joined ${formatDate('2026-08-27T14:47:50.813Z')}`),
    ).toBeInTheDocument()
  })

  it('shows an Active badge for an active customer', async () => {
    reply(mock)
    renderPage()

    const header = (await screen.findByRole('heading', { level: 1 })).closest('header') as HTMLElement
    expect(within(header).getByText('Active')).toBeInTheDocument()
  })

  it('shows an Inactive badge for a deactivated customer', async () => {
    reply(mock, { isActive: false })
    renderPage()

    const header = (await screen.findByRole('heading', { level: 1 })).closest('header') as HTMLElement
    expect(within(header).getByText('Inactive')).toBeInTheDocument()
  })

  it('renders the customer information card from real fields only', async () => {
    reply(mock)
    renderPage()

    const info = (await screen.findByText('Phone')).closest('dl') as HTMLElement
    expect(within(within(info).getByText('Email').closest('div')!).getByText('shopper@example.test')).toBeInTheDocument()
    expect(within(within(info).getByText('Phone').closest('div')!).getByText('9876543210')).toBeInTheDocument()
    expect(
      within(within(info).getByText('Joined').closest('div')!).getByText(formatDate('2026-08-27T14:47:50.813Z')),
    ).toBeInTheDocument()
  })

  it('renders the address in an <address> element with only the lines that exist', async () => {
    reply(mock, { addressLine2: null })
    const { container } = renderPage()

    await screen.findByText('221B Baker St')
    const address = container.querySelector('address') as HTMLElement
    expect(address).not.toBeNull()
    expect(within(address).getByText('221B Baker St')).toBeInTheDocument()
    expect(within(address).getByText('London, LDN, NW16XE')).toBeInTheDocument()
    expect(within(address).getByText('UK')).toBeInTheDocument()
  })

  it('shows a dash for a missing phone number', async () => {
    reply(mock, { phone: null })
    renderPage()

    const info = (await screen.findByText('Phone')).closest('dl') as HTMLElement
    expect(within(within(info).getByText('Phone').closest('div')!).getByText('—')).toBeInTheDocument()
  })

  it('shows the two summary metrics using backend values', async () => {
    reply(mock, { orderCount: 7, totalSpend: '1234.50' })
    renderPage()

    const orders = await screen.findByRole('region', { name: 'Orders' })
    expect(within(orders).getByText('7')).toBeInTheDocument()
    const spend = screen.getByRole('region', { name: 'Total spend' })
    expect(within(spend).getByText('₹1,234.50')).toBeInTheDocument()
  })

  it('renders recent orders as a semantic table with the expected columns and values', async () => {
    reply(mock)
    renderPage()

    const table = await screen.findByRole('table', { name: 'Recent orders' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Order', 'Date', 'Items', 'Status', 'Total'])

    const row = within(table).getByRole('link', { name: 'PF-000001' }).closest('tr') as HTMLElement
    expect(within(row).getByRole('link', { name: 'PF-000001' })).toHaveAttribute(
      'href',
      '/admin/orders/order-1',
    )
    expect(within(row).getByText(formatDate('2026-08-27T14:27:57.215Z'))).toBeInTheDocument()
    expect(within(row).getByText('1')).toBeInTheDocument()
    expect(within(row).getByText('Payment confirmed')).toBeInTheDocument()
    expect(within(row).getByText('₹249.00')).toBeInTheDocument()
    // Order number is the row's only link.
    expect(within(row).getAllByRole('link')).toHaveLength(1)
  })

  it('flags a recent order that needs a manual refund', async () => {
    reply(mock, {
      recentOrders: [
        {
          id: 'order-2',
          orderNumber: 'PF-000002',
          status: 'REFUNDED',
          total: '99.00',
          currency: 'INR',
          itemCount: 1,
          needsManualRefund: true,
          createdAt: '2026-08-27T14:27:57.215Z',
        },
      ],
    })
    renderPage()

    const row = (await screen.findByRole('link', { name: 'PF-000002' })).closest('tr') as HTMLElement
    expect(within(row).getByText('Refund pending')).toBeInTheDocument()
  })

  it('shows an empty state (not a table) when the customer has no orders', async () => {
    reply(mock, { recentOrders: [] })
    renderPage()

    expect(await screen.findByText('No orders yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('links "View all orders" to the orders list filtered by this customer', async () => {
    reply(mock)
    renderPage()

    const link = await screen.findByRole('link', { name: 'View all orders' })
    expect(link).toHaveAttribute('href', '/admin/orders?userId=cust-1')
  })

  it('links back to the customers list via a breadcrumb', async () => {
    reply(mock)
    renderPage()

    await screen.findByText('221B Baker St')
    expect(screen.getByRole('link', { name: 'Customers' })).toHaveAttribute('href', '/admin/customers')
  })

  // ─── States ────────────────────────────────────────────────────────────

  it('shows a page-level skeleton with aria-busy while loading', () => {
    mock.onGet('/admin/customers/cust-1').reply(() => new Promise(() => {}))
    renderPage()

    expect(screen.getByLabelText('Loading')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('shopper@example.test')).not.toBeInTheDocument()
  })

  it('surfaces a fetch error through the shared Alert inside the page shell', async () => {
    mock.onGet('/admin/customers/cust-1').reply(404, {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Customer not found', details: [] },
    })
    renderPage()

    expect(await screen.findByText('Customer not found')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Customer')
  })

  // ─── Negative assertions ───────────────────────────────────────────────

  it('has no customer actions, no search, no analytics, and no raw JSON', async () => {
    reply(mock)
    renderPage()

    await screen.findByText('221B Baker St')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('figure')).not.toBeInTheDocument()
    expect(document.querySelector('canvas')).toBeNull()
    expect(screen.queryByText(/^\{/)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/average order value|lifetime value|retention|conversion|segmentation/i),
    ).not.toBeInTheDocument()
    // No deactivate / delete / impersonate / email / password-reset controls.
    expect(
      screen.queryByRole('button', { name: /deactivate|delete|impersonate|reset|email/i }),
    ).not.toBeInTheDocument()
  })
})
