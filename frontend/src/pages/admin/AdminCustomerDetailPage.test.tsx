import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { createTestQueryClient } from '@/test/test-utils'
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

describe('AdminCustomerDetailPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  it('renders order count, total spend, address, and recent orders — read-only, no edit control', async () => {
    mock.onGet('/admin/customers/cust-1').reply(200, { success: true, data: buildCustomer() })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'shopper@example.test' })).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('₹498.00')).toBeInTheDocument()
    expect(screen.getByText(/221B Baker St/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /PF-000001/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows "No address on file" when the customer has none', async () => {
    mock.onGet('/admin/customers/cust-1').reply(
      200,
      {
        success: true,
        data: buildCustomer({ addressLine1: null, city: null, state: null, postalCode: null, country: null, phone: null }),
      },
    )

    renderPage()

    expect(await screen.findByText('No address on file.')).toBeInTheDocument()
  })
})
