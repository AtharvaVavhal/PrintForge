import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { loadRazorpayCheckout } from '@/services/razorpay/loadRazorpayCheckout'
import { useRazorpayCheckout } from './useRazorpayCheckout'
import type { RazorpayConstructor, RazorpayCheckoutOptions } from '@/types/razorpay'

vi.mock('@/services/razorpay/loadRazorpayCheckout', () => ({
  loadRazorpayCheckout: vi.fn(),
}))

vi.mock('@/hooks/useVerifyPayment', () => ({
  useVerifyPayment: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

const mockLoadRazorpayCheckout = vi.mocked(loadRazorpayCheckout)

interface CapturedInstance {
  options: RazorpayCheckoutOptions
  open: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}

const MockRazorpay: RazorpayConstructor = vi.fn().mockImplementation(function (options: RazorpayCheckoutOptions) {
  const instance: CapturedInstance = { options, open: vi.fn(), on: vi.fn() }
  razorpayInstances.push(instance)
  return instance
})

let razorpayInstances: CapturedInstance[]

describe('useRazorpayCheckout', () => {
  beforeEach(() => {
    razorpayInstances = []
    window.Razorpay = MockRazorpay
  })

  afterEach(() => {
    vi.resetModules()
    delete (window as { Razorpay?: unknown }).Razorpay
    vi.clearAllMocks()
  })

  it('opens Razorpay widget with correct options', async () => {
    const onVerified = vi.fn()
    const onDismissed = vi.fn()
    const onError = vi.fn()

    mockLoadRazorpayCheckout.mockResolvedValueOnce(MockRazorpay)

    const { result } = renderHook(() => useRazorpayCheckout({ onVerified, onDismissed, onError }))

    await act(async () => {
      await result.current.openCheckout(
        { paymentAttemptId: 'pa-1', razorpayOrderId: 'order_rzp_1', razorpayKeyId: 'rzp_test', amountPaise: '34900', currency: 'INR' },
        { orderNumber: 'PF-000001' },
        { name: 'John Doe', contact: '9876543210', email: 'john@example.com' }
      )
    })

    await waitFor(() => expect(razorpayInstances).toHaveLength(1))
    expect(razorpayInstances[0].options.key).toBe('rzp_test')
    expect(razorpayInstances[0].options.amount).toBe(34900)
    expect(razorpayInstances[0].options.order_id).toBe('order_rzp_1')
    expect(razorpayInstances[0].options.prefill).toEqual({ name: 'John Doe', contact: '9876543210', email: 'john@example.com' })
  })

  it('calls onError with script load error message when load fails', async () => {
    const onVerified = vi.fn()
    const onDismissed = vi.fn()
    const onError = vi.fn()

    mockLoadRazorpayCheckout.mockRejectedValueOnce(new Error('Failed to load the Razorpay Checkout script'))

    const { result } = renderHook(() => useRazorpayCheckout({ onVerified, onDismissed, onError }))

    await act(async () => {
      await result.current.openCheckout(
        { paymentAttemptId: 'pa-1', razorpayOrderId: 'order_rzp_1', razorpayKeyId: 'rzp_test', amountPaise: '34900', currency: 'INR' },
        { orderNumber: 'PF-000001' },
      )
    })

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Failed to load the Razorpay Checkout script'))
  })

  it('calls onDismissed when modal is dismissed', async () => {
    const onVerified = vi.fn()
    const onDismissed = vi.fn()
    const onError = vi.fn()

    mockLoadRazorpayCheckout.mockResolvedValueOnce(MockRazorpay)

    const { result } = renderHook(() => useRazorpayCheckout({ onVerified, onDismissed, onError }))

    await act(async () => {
      await result.current.openCheckout(
        { paymentAttemptId: 'pa-1', razorpayOrderId: 'order_rzp_1', razorpayKeyId: 'rzp_test', amountPaise: '34900', currency: 'INR' },
        { orderNumber: 'PF-000001' },
      )
    })

    await waitFor(() => expect(razorpayInstances).toHaveLength(1))

    const ondismiss = razorpayInstances[0].options.modal?.ondismiss
    act(() => { ondismiss?.() })

    expect(onDismissed).toHaveBeenCalledTimes(1)
  })
})