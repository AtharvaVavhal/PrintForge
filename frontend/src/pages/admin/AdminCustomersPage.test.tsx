import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { AdminCustomersPage } from './AdminCustomersPage'

function buildCustomer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cust-1',
    email: 'shopper@example.test',
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    phone: null,
    role: 'CUSTOMER',
    isActive: true,
    createdAt: '2026-08-27T14:47:50.813Z',
    orderCount: 3,
    ...overrides,
  }
}

function customersResponse(items: unknown[], meta?: Partial<{ page: number; totalPages: number; total: number }>) {
  return {
    success: true,
    data: items,
    meta: { page: 1, limit: 20, total: items.length, totalPages: 1, ...meta },
  }
}

function adminCustomersCalls(mock: MockAdapter) {
  return mock.history.get.filter((r) => r.url === '/admin/customers')
}

describe('AdminCustomersPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  it('lists customers and links each into the admin customer detail route', async () => {
    mock.onGet('/admin/customers').reply(200, customersResponse([buildCustomer()]))

    renderWithProviders(<AdminCustomersPage />)

    const link = await screen.findByRole('link', { name: /shopper@example\.test/ })
    expect(link).toHaveAttribute('href', '/admin/customers/cust-1')
    expect(screen.getByText('3 orders')).toBeInTheDocument()
  })

  it('flags an inactive customer in the list', async () => {
    mock.onGet('/admin/customers').reply(200, customersResponse([buildCustomer({ isActive: false })]))

    renderWithProviders(<AdminCustomersPage />)

    expect(await screen.findByText('Inactive')).toBeInTheDocument()
  })

  it('shows real pagination driven by the backend meta', async () => {
    mock.onGet('/admin/customers').reply(200, customersResponse([buildCustomer()], { totalPages: 2 }))

    renderWithProviders(<AdminCustomersPage />)

    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument()
  })

  it('renders a single h1 and a semantic table with the expected column headers', async () => {
    mock.onGet('/admin/customers').reply(200, customersResponse([buildCustomer()]))

    renderWithProviders(<AdminCustomersPage />)

    await screen.findByRole('link', { name: /shopper@example\.test/ })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Customers')
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Customer', 'Orders', 'Joined', 'Status'])
  })

  it('shows an active customer status that is not conveyed by colour alone', async () => {
    mock.onGet('/admin/customers').reply(200, customersResponse([buildCustomer({ isActive: true })]))

    renderWithProviders(<AdminCustomersPage />)

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Active')).toBeInTheDocument()
  })

  it('shows a page-level skeleton with aria-busy while the first fetch is in flight', () => {
    mock.onGet('/admin/customers').reply(() => new Promise(() => {}))

    renderWithProviders(<AdminCustomersPage />)

    expect(screen.getByLabelText('Loading')).toHaveAttribute('aria-busy', 'true')
  })

  it('surfaces a fetch error through the shared Alert (getApiErrorMessage)', async () => {
    mock.onGet('/admin/customers').reply(500)

    renderWithProviders(<AdminCustomersPage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/something went wrong/i)
  })

  it('shows a designed empty state when there are no customers', async () => {
    mock.onGet('/admin/customers').reply(200, customersResponse([]))

    renderWithProviders(<AdminCustomersPage />)

    expect(await screen.findByText('No customers yet')).toBeInTheDocument()
  })

  it('has no search or filter controls (the backend supports neither)', async () => {
    mock.onGet('/admin/customers').reply(200, customersResponse([buildCustomer()]))

    renderWithProviders(<AdminCustomersPage />)

    await screen.findByRole('link', { name: /shopper@example\.test/ })
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('pages through results with the keyboard-accessible AdminPagination control', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/customers').reply((config) => {
      const page = (config.params as { page?: number } | undefined)?.page ?? 1
      return [
        200,
        customersResponse([buildCustomer({ id: `cust-${page}`, email: `p${page}@example.test` })], {
          page: Number(page),
          totalPages: 2,
        }),
      ]
    })

    renderWithProviders(<AdminCustomersPage />)
    await screen.findByRole('link', { name: /p1@example\.test/ })

    const next = screen.getByRole('button', { name: 'Next' })
    next.focus()
    expect(next).toHaveFocus()
    await user.keyboard('{Enter}')

    await screen.findByRole('link', { name: /p2@example\.test/ })
    expect((adminCustomersCalls(mock).at(-1)?.params as { page?: number }).page).toBe(2)
  })

  it('keeps the customer email as the row’s only link (no whole-row navigation)', async () => {
    mock.onGet('/admin/customers').reply(200, customersResponse([buildCustomer()]))

    renderWithProviders(<AdminCustomersPage />)

    const row = (await screen.findByRole('link', { name: /shopper@example\.test/ })).closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getAllByRole('link')).toHaveLength(1)
  })
})
