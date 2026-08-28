import { useMutation } from '@tanstack/react-query'
import { validateCheckout } from '@/services/api/checkout'

/** No cache to invalidate — this is a read-only preview, not a write.
 * A mutation (not a query) because it's explicitly triggered on submit
 * of the coupon-code field, never fetched automatically on mount or
 * keystroke (see CouponForm.tsx). */
export function useValidateCheckout() {
  return useMutation({
    mutationFn: validateCheckout,
  })
}
