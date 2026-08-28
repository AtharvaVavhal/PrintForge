import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { createTestQueryClient } from '@/test/test-utils'
import type { OrderStatus } from '@/types/orders'
import { AdminOrderDetailPage } from './AdminOrderDetailPage'

function buildOrder(
  overrides: Partial<{
    status: OrderStatus
    needsManualRefund: boolean
    total: string
    discountAmount: string
    couponCode: string | null
  }> = {},
) {
  return {
    id: 'order-1',
    orderNumber: 'PF-000001',
    status: 'PAID' as OrderStatus,
    total: '349.00',
    currency: 'INR',
    itemCount: 2,
    needsManualRefund: false,
    subtotal: '300.00',
    discountAmount: '0.00',
    couponCode: null as string | null,
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
    statusHistory: [
      {
        fromStatus: null,
        toStatus: 'PENDING_PAYMENT',
        changedByUserId: 'user-1',
        note: 'Order created from cart at checkout',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    paymentAttempts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/orders/order-1']}>
        <Routes>
          <Route path="/admin/orders/:id" element={<AdminOrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AdminOrderDetailPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  it('renders the order, its items, shipping address, and status history', async () => {
    mock.onGet('/admin/orders/order-1').reply(200, { success: true, data: buildOrder() })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Order PF-000001' })).toBeInTheDocument()
    const heading = screen.getByRole('heading', { name: 'Order PF-000001' })
    expect(within(heading.parentElement!).getByText('Payment confirmed')).toBeInTheDocument()
    expect(screen.getByText('Ceramic Mug')).toBeInTheDocument()
    expect(screen.getByText(/123 Test St/)).toBeInTheDocument()
    expect(screen.getByText('Order created from cart at checkout')).toBeInTheDocument()
  })

  it('shows no discount row when no coupon was applied', async () => {
    mock.onGet('/admin/orders/order-1').reply(200, { success: true, data: buildOrder() })

    renderPage()

    await screen.findByText('₹349.00')
    expect(screen.queryByText(/Discount/)).not.toBeInTheDocument()
  })

  it('shows the discount row with the coupon code when one was applied', async () => {
    mock.onGet('/admin/orders/order-1').reply(200, {
      success: true,
      data: buildOrder({ total: '319.00', discountAmount: '30.00', couponCode: 'SAVE10' }),
    })

    renderPage()

    await screen.findByText('₹319.00')
    expect(screen.getByText('SAVE10')).toBeInTheDocument()
    expect(screen.getByText('−₹30.00')).toBeInTheDocument()
  })

  it('shows a manual-refund banner only when needsManualRefund is true', async () => {
    mock.onGet('/admin/orders/order-1').reply(200, { success: true, data: buildOrder({ needsManualRefund: true }) })

    renderPage()

    expect(await screen.findByText(/refund pending manual processing/i)).toBeInTheDocument()
  })

  it('offers every order status as a candidate, not just ones legal from the current status', async () => {
    mock.onGet('/admin/orders/order-1').reply(200, { success: true, data: buildOrder({ status: 'PENDING_PAYMENT' }) })

    renderPage()

    const select = await screen.findByLabelText('Change status')
    // DELIVERED is not a legal transition from PENDING_PAYMENT per the
    // backend's state machine, but the form still offers it — submitting
    // it is what proves the 409 path, not a disabled/missing option here.
    expect(within(select).getByRole('option', { name: 'Delivered' })).toBeInTheDocument()
  })

  it('status-change happy path: submits the picked status and reflects it without a manual refetch', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/orders/order-1').reply(200, { success: true, data: buildOrder({ status: 'PENDING_PAYMENT' }) })
    mock.onPatch('/admin/orders/order-1/status').reply(200, {
      success: true,
      data: buildOrder({ status: 'PAID' }),
    })

    renderPage()

    const select = await screen.findByLabelText('Change status')
    await user.selectOptions(select, 'Payment confirmed')
    await user.click(screen.getByRole('button', { name: 'Update status' }))

    await waitFor(() => expect(mock.history.patch.length).toBe(1))
    const body = JSON.parse(mock.history.patch[0].data as string) as Record<string, unknown>
    expect(body).toEqual({ status: 'PAID' })

    // The order's own status badge reflects the mutation's response —
    // instant, no reliance on the background refetch it also triggers.
    await waitFor(() => expect(screen.getAllByText('Payment confirmed').length).toBeGreaterThan(0))
  })

  it('status-change rejection is surfaced from the backend, not pre-validated client-side', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/orders/order-1').reply(200, { success: true, data: buildOrder({ status: 'PENDING_PAYMENT' }) })
    mock.onPatch('/admin/orders/order-1/status').reply(409, {
      success: false,
      error: { code: 'CONFLICT', message: 'Illegal order transition: PENDING_PAYMENT -> DELIVERED', details: [] },
    })

    renderPage()

    const select = await screen.findByLabelText('Change status')
    await user.selectOptions(select, 'Delivered')
    // The form let the pick through with no client-side block — the
    // Update button was never disabled for this "illegal" choice.
    const submitButton = screen.getByRole('button', { name: 'Update status' })
    expect(submitButton).not.toBeDisabled()
    await user.click(submitButton)

    expect(await screen.findByText('Illegal order transition: PENDING_PAYMENT -> DELIVERED')).toBeInTheDocument()
    // Still showing the original status — the rejected PATCH never took.
    const heading = screen.getByRole('heading', { name: 'Order PF-000001' })
    expect(within(heading.parentElement!).getByText('Awaiting payment')).toBeInTheDocument()
  })

  it('includes a reason in the PATCH body only when one was typed', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/orders/order-1').reply(200, { success: true, data: buildOrder({ status: 'PENDING_PAYMENT' }) })
    mock.onPatch('/admin/orders/order-1/status').reply(200, { success: true, data: buildOrder({ status: 'PAID' }) })

    renderPage()

    const select = await screen.findByLabelText('Change status')
    await user.selectOptions(select, 'Payment confirmed')
    await user.type(screen.getByLabelText('Reason (optional)'), 'Manually confirmed after bank transfer')
    await user.click(screen.getByRole('button', { name: 'Update status' }))

    await waitFor(() => expect(mock.history.patch.length).toBe(1))
    const body = JSON.parse(mock.history.patch[0].data as string) as Record<string, unknown>
    expect(body).toEqual({ status: 'PAID', reason: 'Manually confirmed after bank transfer' })
  })
})
