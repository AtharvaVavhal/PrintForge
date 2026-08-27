import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { AdminDashboardPage } from './AdminDashboardPage'

function buildDashboard() {
  return {
    totalOrders: 14,
    ordersByStatus: [
      { status: 'PENDING_PAYMENT', count: 11 },
      { status: 'PAID', count: 3 },
      { status: 'PAYMENT_FAILED', count: 0 },
      { status: 'CONFIRMED', count: 0 },
      { status: 'IN_PRODUCTION', count: 0 },
      { status: 'SHIPPED', count: 0 },
      { status: 'DELIVERED', count: 0 },
      { status: 'CANCELLED', count: 0 },
      { status: 'REFUNDED', count: 0 },
    ],
    totalRevenue: '597.00',
    recentOrders: [
      {
        id: 'order-1',
        orderNumber: 'PF-000014',
        status: 'PENDING_PAYMENT',
        total: '199.00',
        currency: 'INR',
        itemCount: 1,
        needsManualRefund: false,
        createdAt: '2026-08-27T14:27:57.215Z',
      },
    ],
  }
}

describe('AdminDashboardPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  it('renders order count, revenue, per-status breakdown, and recent orders as a designed view — not a JSON dump', async () => {
    mock.onGet('/admin/dashboard').reply(200, { success: true, data: buildDashboard() })

    renderWithProviders(<AdminDashboardPage />)

    expect(await screen.findByText('14')).toBeInTheDocument()
    expect(screen.getByText('₹597.00')).toBeInTheDocument()
    expect(screen.getAllByText('Awaiting payment').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /PF-000014/ })).toBeInTheDocument()
    expect(screen.queryByText(/^\{/)).not.toBeInTheDocument()
  })

  it('links a recent order row into the admin order detail route', async () => {
    mock.onGet('/admin/dashboard').reply(200, { success: true, data: buildDashboard() })

    renderWithProviders(<AdminDashboardPage />)

    const link = await screen.findByRole('link', { name: /PF-000014/ })
    expect(link).toHaveAttribute('href', '/admin/orders/order-1')
  })
})
