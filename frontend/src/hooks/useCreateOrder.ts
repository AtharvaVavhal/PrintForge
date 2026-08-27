import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createOrder } from '@/services/api/checkout'
import type { CreateOrderPayload } from '@/types/checkout'
import { CART_QUERY_KEY } from './useCart'

export function useCreateOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: { payload: CreateOrderPayload; idempotencyKey: string }) =>
      createOrder(payload, idempotencyKey),
    // Checkout clears the server-side cart on success (§13.G) — invalidate
    // so a later visit to /cart doesn't show stale pre-checkout items
    // (§10 line 377: "invalidated after every mutation").
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
    },
  })
}
