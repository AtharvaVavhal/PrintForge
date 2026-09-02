import { useQuery } from '@tanstack/react-query'
import { validateCheckout } from '@/services/api/checkout'
import type { CheckoutPreviewView } from '@/types/coupons'

/**
 * Server-authoritative pricing preview for the checkout page (UX-06):
 * subtotal + shipping + tax + total for the caller's current cart with no
 * coupon. Backed by the existing read-only `POST /checkout/validate` —
 * nothing is created or claimed, and the real numbers are still whatever
 * `POST /checkout/orders` computes at order time.
 *
 * Only used while no coupon is applied — once one is, `CouponForm`'s own
 * `POST /checkout/validate` response (stored as `couponPreview` on
 * CheckoutPage) drives the breakdown instead, so the caller passes
 * `enabled: false` in that state to avoid a redundant call.
 *
 * `enabled` must also be false when the cart is empty (the endpoint 400s
 * on an empty cart).
 */
export function useCheckoutPreview({ enabled }: { enabled: boolean }) {
  return useQuery<CheckoutPreviewView>({
    queryKey: ['checkout', 'preview'],
    queryFn: () => validateCheckout({}),
    enabled,
    staleTime: 0,
    retry: false,
  })
}
