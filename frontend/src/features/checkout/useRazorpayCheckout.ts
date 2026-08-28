import { useCallback, useState } from 'react'
import { getApiErrorMessage } from '@/utils/apiError'
import { loadRazorpayCheckout } from '@/services/razorpay/loadRazorpayCheckout'
import { useVerifyPayment } from '@/hooks/useVerifyPayment'
import type { InitiatePaymentView, VerifyPaymentView } from '@/types/payments'

interface OrderPrefill {
  orderNumber: string
}

interface CustomerPrefill {
  name?: string
  contact?: string
}

interface UseRazorpayCheckoutOptions {
  /** Fired once POST /payments/verify returns 2xx. `result.status` is the
   * order's real status right after this call's own attempt (or a race it
   * lost) — NOT a guarantee the payment is confirmed. Never render
   * "Payment confirmed" off this callback directly; re-derive that from a
   * fresh GET /orders/:id instead (§13.G, the webhook is authoritative). */
  onVerified: (result: VerifyPaymentView) => void
  /** Fired when the widget is closed without completing payment (modal
   * dismissed/cancelled) or Razorpay reports a payment.failed event. The
   * order still exists in PENDING_PAYMENT either way — callers should stay
   * put and offer a "Retry Payment" action, not treat this as if the order
   * vanished. */
  onDismissed: () => void
  onError: (message: string) => void
}

/**
 * Wraps Razorpay Checkout.js's imperative widget lifecycle: loads the
 * script once (cached across calls), opens the widget for a given payment
 * attempt, and posts the widget's success callback to POST /payments/verify.
 * Used both right after checkout creates a fresh order and by a later
 * "Retry Payment" action — the caller decides what to do with onVerified/
 * onDismissed, this hook only owns the widget + verify call.
 */
export function useRazorpayCheckout({ onVerified, onDismissed, onError }: UseRazorpayCheckoutOptions) {
  const [isOpening, setIsOpening] = useState(false)
  const verifyMutation = useVerifyPayment()

  const openCheckout = useCallback(
    async (payment: InitiatePaymentView, order: OrderPrefill, customer?: CustomerPrefill) => {
      setIsOpening(true)
      try {
        const Razorpay = await loadRazorpayCheckout()
        const instance = new Razorpay({
          key: payment.razorpayKeyId,
          amount: Number(payment.amountPaise),
          currency: payment.currency,
          order_id: payment.razorpayOrderId,
          name: 'AB Creations',
          description: `Order ${order.orderNumber}`,
          prefill: customer,
          handler: (response) => {
            verifyMutation.mutate(
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
              {
                onSuccess: onVerified,
                onError: (err) => onError(getApiErrorMessage(err)),
              },
            )
          },
          modal: {
            ondismiss: onDismissed,
          },
        })
        instance.on('payment.failed', () => onDismissed())
        instance.open()
      } catch {
        onError('Could not open the payment window. Please try again.')
      } finally {
        setIsOpening(false)
      }
    },
    [verifyMutation, onVerified, onDismissed, onError],
  )

  return { openCheckout, isOpening, isVerifying: verifyMutation.isPending }
}
