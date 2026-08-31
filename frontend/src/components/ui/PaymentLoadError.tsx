import { Alert } from '@/components/ui/Alert'

interface PaymentLoadErrorProps {
  message?: string
  onRetry?: () => void
}

/**
 * Friendly error banner shown when Razorpay Checkout.js script fails to load
 * (network failure, CSP block, ad-blocker). Provides actionable guidance.
 */
export function PaymentLoadError({ message, onRetry }: PaymentLoadErrorProps) {
  return (
    <Alert variant="error">
      <div className="payment-load-error">
        <strong>Payment service unavailable</strong>
        <p>
          {message ?? 'Unable to load the payment window. This may be due to network issues, browser extensions, or security settings.'}
        </p>
        <p className="payment-load-error__hint">
          Try disabling ad-blockers or tracking protection for this site, then click Retry.
        </p>
        {onRetry && (
          <button
            type="button"
            className="payment-load-error__retry"
            onClick={onRetry}
            aria-label="Retry loading payment service"
          >
            Retry
          </button>
        )}
      </div>
    </Alert>
  )
}