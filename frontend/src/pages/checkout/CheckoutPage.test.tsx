import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { AuthContext } from '@/features/auth/authContext'
import { createMockAuthContext, createTestQueryClient } from '@/test/test-utils'
import type { RazorpayCheckoutOptions } from '@/types/razorpay'
import { CheckoutPage } from './CheckoutPage'

const AUTH_VALUE = createMockAuthContext({
  status: 'authenticated',
  user: { id: 'user-1', email: 'shopper@example.test', role: 'CUSTOMER', createdAt: '2026-01-01T00:00:00.000Z' },
})

function buildCart() {
  return {
    id: 'cart-1',
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        productName: 'Ceramic Mug',
        variantId: null,
        variantLabel: null,
        quantity: 2,
        unitPrice: '150.00',
        lineTotal: '300.00',
        isAvailable: true,
        unavailableReason: null,
        customizations: [],
      },
    ],
    itemCount: 2,
    subtotal: '300.00',
  }
}

const ORDER_VIEW = {
  id: 'order-1',
  orderNumber: 'PF-000001',
  status: 'PENDING_PAYMENT',
  subtotal: '300.00',
  shippingFee: '49.00',
  total: '349.00',
  currency: 'INR',
  shippingRecipientName: 'Jane Doe',
  shippingPhone: '9876543210',
  shippingAddressLine1: '123 Test St',
  shippingAddressLine2: null,
  shippingCity: 'Mumbai',
  shippingState: 'MH',
  shippingPostalCode: '400001',
  shippingCountry: 'India',
  items: [],
  createdAt: '2026-01-01T00:00:00.000Z',
}

const PAYMENT_VIEW = {
  paymentAttemptId: 'pa-1',
  razorpayOrderId: 'order_rzp_1',
  razorpayKeyId: 'rzp_test_key',
  amountPaise: '34900',
  currency: 'INR',
}

/** Stands in for OrderDetailPage — proves navigation happened without
 * pulling that page's own dependencies/mocks into this test. */
function ConfirmationStub() {
  const { id } = useParams<{ id: string }>()
  return <div data-testid="confirmation-stub">Order {id}</div>
}

function renderCheckout() {
  const queryClient = createTestQueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/checkout']}>
        <AuthContext.Provider value={AUTH_VALUE}>
          <Routes>
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/orders/:id" element={<ConfirmationStub />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function fillShippingForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Recipient name'), 'Jane Doe')
  await user.type(screen.getByLabelText('Phone number'), '9876543210')
  await user.type(screen.getByLabelText('Address line 1'), '123 Test St')
  await user.type(screen.getByLabelText('City'), 'Mumbai')
  await user.type(screen.getByLabelText('State'), 'MH')
  await user.type(screen.getByLabelText('Postal code'), '400001')
  await user.type(screen.getByLabelText('Country'), 'India')
}

interface CapturedInstance {
  options: RazorpayCheckoutOptions
  open: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}

describe('CheckoutPage', () => {
  let mock: MockAdapter
  let razorpayInstances: CapturedInstance[]

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    mock.onGet('/cart').reply(200, { success: true, data: buildCart() })
    razorpayInstances = []
    // A plain `function`, not an arrow function — arrow functions have no
    // [[Construct]] slot, so `new Razorpay(...)` (openCheckout.ts) would
    // throw "is not a constructor" against a mock built from one.
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

  it('reuses the same Idempotency-Key across a failed attempt and its retry within one page mount', async () => {
    const user = userEvent.setup()
    mock.onPost('/checkout/orders').replyOnce(500, {
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something broke', details: [] },
    })
    mock.onPost('/checkout/orders').reply(201, { success: true, data: ORDER_VIEW })
    mock.onPost('/checkout/orders/order-1/retry-payment').reply(200, { success: true, data: PAYMENT_VIEW })

    renderCheckout()
    await screen.findByLabelText('Recipient name')
    await fillShippingForm(user)
    await user.click(screen.getByRole('button', { name: 'Pay now' }))

    await screen.findByText('Something broke')
    await user.click(screen.getByRole('button', { name: 'Pay now' }))

    await waitFor(() => expect(razorpayInstances).toHaveLength(1))

    const checkoutCalls = mock.history.post.filter((r) => r.url === '/checkout/orders')
    expect(checkoutCalls).toHaveLength(2)
    const key1 = checkoutCalls[0].headers?.['Idempotency-Key'] as string | undefined
    const key2 = checkoutCalls[1].headers?.['Idempotency-Key'] as string | undefined
    expect(key1).toBeTruthy()
    expect(key1).toBe(key2)
  })

  it('opens Razorpay Checkout.js after creating the order, and only navigates to the order confirmation page once /payments/verify responds', async () => {
    const user = userEvent.setup()
    mock.onPost('/checkout/orders').reply(201, { success: true, data: ORDER_VIEW })
    mock.onPost('/checkout/orders/order-1/retry-payment').reply(200, { success: true, data: PAYMENT_VIEW })
    mock.onPost('/payments/verify').reply(200, {
      success: true,
      data: { orderId: 'order-1', status: 'PAID' },
    })

    renderCheckout()
    await screen.findByLabelText('Recipient name')
    await fillShippingForm(user)
    await user.click(screen.getByRole('button', { name: 'Pay now' }))

    await waitFor(() => expect(razorpayInstances).toHaveLength(1))
    const { options } = razorpayInstances[0]
    expect(options.order_id).toBe('order_rzp_1')
    expect(options.key).toBe('rzp_test_key')
    expect(options.amount).toBe(34900)

    // Not navigated yet — the widget "succeeding" client-side isn't itself
    // proof of payment (§13.G); only a verify() response is.
    expect(screen.queryByTestId('confirmation-stub')).not.toBeInTheDocument()

    options.handler({
      razorpay_order_id: 'order_rzp_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'sig_1',
    })

    await waitFor(() => {
      const verifyCall = mock.history.post.find((r) => r.url === '/payments/verify')
      expect(verifyCall).toBeDefined()
      expect(JSON.parse(verifyCall!.data as string)).toEqual({
        razorpay_order_id: 'order_rzp_1',
        razorpay_payment_id: 'pay_1',
        razorpay_signature: 'sig_1',
      })
    })

    expect(await screen.findByTestId('confirmation-stub')).toHaveTextContent('Order order-1')
  })

  it('keeps the order visible with a Retry Payment action when the Razorpay widget is dismissed, and retrying reuses the same order', async () => {
    const user = userEvent.setup()
    mock.onPost('/checkout/orders').reply(201, { success: true, data: ORDER_VIEW })
    mock.onPost('/checkout/orders/order-1/retry-payment').reply(200, { success: true, data: PAYMENT_VIEW })

    renderCheckout()
    await screen.findByLabelText('Recipient name')
    await fillShippingForm(user)
    await user.click(screen.getByRole('button', { name: 'Pay now' }))

    await waitFor(() => expect(razorpayInstances).toHaveLength(1))
    razorpayInstances[0].options.modal?.ondismiss?.()

    expect(await screen.findByText(/Payment was not completed/)).toBeInTheDocument()
    // The order itself is still shown — never looks like it vanished.
    expect(screen.getByText('Order PF-000001')).toBeInTheDocument()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry payment' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Retry payment' }))

    await waitFor(() => expect(razorpayInstances).toHaveLength(2))
    const retryPaymentCalls = mock.history.post.filter((r) => r.url === '/checkout/orders/order-1/retry-payment')
    expect(retryPaymentCalls).toHaveLength(2)
    // Retrying never re-submits a whole new checkout.
    expect(mock.history.post.filter((r) => r.url === '/checkout/orders')).toHaveLength(1)
  })
})
