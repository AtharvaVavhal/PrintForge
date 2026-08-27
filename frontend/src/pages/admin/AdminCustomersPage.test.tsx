import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
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
})
