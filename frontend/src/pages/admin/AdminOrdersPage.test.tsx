import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { AdminOrdersPage } from './AdminOrdersPage'

function ordersResponse(items: unknown[], meta?: Partial<{ page: number; totalPages: number; total: number }>) {
  return {
    success: true,
    data: items,
    meta: { page: 1, limit: 20, total: items.length, totalPages: 1, ...meta },
  }
}

function buildOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'PF-000001',
    status: 'PENDING_PAYMENT',
    total: '199.00',
    currency: 'INR',
    itemCount: 1,
    needsManualRefund: false,
    createdAt: '2026-08-27T14:27:57.215Z',
    ...overrides,
  }
}

describe('AdminOrdersPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  it('lists every order in the system (unscoped by customer) and links each into the admin detail route', async () => {
    mock.onGet('/admin/orders').reply(200, ordersResponse([buildOrder()]))

    renderWithProviders(<AdminOrdersPage />)

    const link = await screen.findByRole('link', { name: /PF-000001/ })
    expect(link).toHaveAttribute('href', '/admin/orders/order-1')
  })

  it('flags a needsManualRefund order in the list', async () => {
    mock.onGet('/admin/orders').reply(200, ordersResponse([buildOrder({ needsManualRefund: true })]))

    renderWithProviders(<AdminOrdersPage />)

    expect(await screen.findByText('Refund pending')).toBeInTheDocument()
  })

  it('shows real pagination driven by the backend meta, not client-side slicing', async () => {
    mock.onGet('/admin/orders').reply(200, ordersResponse([buildOrder()], { totalPages: 3 }))

    renderWithProviders(<AdminOrdersPage />)

    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument()
  })
})
