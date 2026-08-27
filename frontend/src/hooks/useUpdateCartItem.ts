import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateCartItem } from '@/services/api/cart'
import type { CartView } from '@/types/cart'
import { CART_QUERY_KEY } from './useCart'

/** Same cache-patch strategy as useAddCartItem — see its doc comment. On
 * failure the cache is untouched, so the displayed quantity simply stays
 * at the last server-confirmed value (no client-side clamp/guess to
 * revert — §11: never trust a client-side quantity as final). */
export function useUpdateCartItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      updateCartItem(itemId, quantity),
    onSuccess: ({ item, meta }) => {
      queryClient.setQueryData<CartView>(CART_QUERY_KEY, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((existing) => (existing.id === item.id ? item : existing)),
              subtotal: meta.subtotal,
              itemCount: meta.itemCount,
            }
          : old,
      )
      // §10 line 377: "invalidated after every mutation" — see
      // useAddCartItem.ts's identical comment for why this stays alongside
      // the setQueryData patch rather than replacing it.
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
    },
  })
}
