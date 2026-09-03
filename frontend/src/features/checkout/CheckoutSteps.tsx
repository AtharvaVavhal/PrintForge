import { Check } from 'lucide-react'
import { cn } from '@/utils/cn'
import styles from './CheckoutSteps.module.css'

export type CheckoutStep = 'details' | 'payment'

/**
 * The two real phases of the single-page checkout:
 *  1. "Delivery details" — the shipping form + order summary (the "Pay now"
 *     button lives here).
 *  2. "Payment" — the order has been created (POST /checkout/orders) and
 *     the customer is completing payment via Razorpay (OrderPendingPayment).
 *
 * There is no routing or state machine behind this — `current` is derived
 * from CheckoutPage's existing `order` state. Nothing here changes checkout
 * behaviour; it is a progress indicator only.
 */
const STEPS: { id: CheckoutStep; label: string }[] = [
  { id: 'details', label: 'Delivery details' },
  { id: 'payment', label: 'Payment' },
]

export function CheckoutSteps({ current }: { current: CheckoutStep }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current)

  return (
    <ol className={styles.steps} aria-label="Checkout progress">
      {STEPS.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming'
        const prefix =
          state === 'done'
            ? 'Completed: '
            : state === 'current'
              ? 'Current step: '
              : `Step ${index + 1} of ${STEPS.length}: `

        return (
          <li
            key={step.id}
            className={cn(styles.step, styles[state])}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className={styles.marker} aria-hidden="true">
              {state === 'done' ? <Check size={14} strokeWidth={3} /> : index + 1}
            </span>
            <span className={styles.label}>
              <span className={styles.srOnly}>{prefix}</span>
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
