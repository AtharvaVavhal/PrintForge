import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { createTestQueryClient } from '@/test/test-utils'
import type { OrderStatus } from '@/types/orders'
import type { RazorpayCheckoutOptions } from '@/types/razorpay'
import { OrderDetailPage } from './OrderDetailPage'

function buildOrder(status: OrderStatus) {
  return {
    id: 'order-1',
    orderNumber: 'PF-000001',
    status,
    total: '349.00',
    currency: 'INR',
    itemCount: 2,
    needsManualRefund: false,
    subtotal: '300.00',
    shippingRecipientName: 'Jane Doe',
    shippingPhone: '9876543210',
    shippingAddressLine1: '123 Test St',
    shippingAddressLine2: null,
    shippingCity: 'Mumbai',
    shippingState: 'MH',
    shippingPostalCode: '400001',
    shippingCountry: 'India',
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        productName: 'Ceramic Mug',
        variantLabel: null,
        unitPrice: '150.00',
        quantity: 2,
        lineTotal: '300.00',
        customizations: [],
      },
    ],
    statusHistory: [],
    paymentAttempts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const PAYMENT_VIEW = {
  paymentAttemptId: 'pa-1',
  razorpayOrderId: 'order_rzp_1',
  razorpayKeyId: 'rzp_test_key',
  amountPaise: '34900',
  currency: 'INR',
}

function renderOrderDetail() {
  const queryClient = createTestQueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/orders/order-1']}>
        <Routes>
          <Route path="/orders/:id" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

interface CapturedInstance {
  options: RazorpayCheckoutOptions
  open: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}

describe('OrderDetailPage', () => {
  let mock: MockAdapter
  let razorpayInstances: CapturedInstance[]

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    razorpayInstances = []
    window.Razorpay = vi.fn().mockImplementation(function (options: RazorpayCheckoutOptions) {
      const instance: CapturedInstance = { options, open: vi.fn(), on: vi.fn() }
      razorpayInstances.push(instance)
      return instance
    })
  })

  afterEach(() => {
    mock.restore()
    delete (window as { Razorpay?: unknown }).Razorpay
  })

  it('never renders "Payment confirmed" for a still-PENDING_PAYMENT order, regardless of what the checkout flow assumed', async () => {
    mock.onGet('/orders/order-1').reply(200, { success: true, data: buildOrder('PENDING_PAYMENT') })

    renderOrderDetail()

    expect(await screen.findByText('Awaiting payment')).toBeInTheDocument()
    expect(screen.queryByText('Payment confirmed')).not.toBeInTheDocument()
    expect(screen.getByText(/confirming your payment/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay now' })).toBeInTheDocument()
  })

  it('renders "Payment confirmed" only once the order\'s own status field says PAID, with no retry action', async () => {
    mock.onGet('/orders/order-1').reply(200, { success: true, data: buildOrder('PAID') })

    renderOrderDetail()

    expect(await screen.findByText('Payment confirmed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pay now|retry payment/i })).not.toBeInTheDocument()
  })

  it('offers Retry Payment for a PAYMENT_FAILED order and re-opens Razorpay Checkout.js for the same order on click', async () => {
    const user = userEvent.setup()
    mock.onGet('/orders/order-1').reply(200, { success: true, data: buildOrder('PAYMENT_FAILED') })
    mock.onPost('/checkout/orders/order-1/retry-payment').reply(200, { success: true, data: PAYMENT_VIEW })

    renderOrderDetail()

    expect(await screen.findByText('Payment failed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry payment' }))

    await waitFor(() => expect(razorpayInstances).toHaveLength(1))
    expect(razorpayInstances[0].options.order_id).toBe('order_rzp_1')
    expect(mock.history.post.filter((r) => r.url === '/checkout/orders/order-1/retry-payment')).toHaveLength(1)
  })
})
