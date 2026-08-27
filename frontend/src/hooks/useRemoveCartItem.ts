import { useMutation, useQueryClient } from '@tanstack/react-query'
import { removeCartItem } from '@/services/api/cart'
import type { CartView } from '@/types/cart'
import { CART_QUERY_KEY } from './useCart'

/** Same cache-patch strategy as useAddCartItem — see its doc comment. */
export function useRemoveCartItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => removeCartItem(itemId),
    onSuccess: ({ meta }, itemId) => {
      queryClient.setQueryData<CartView>(CART_QUERY_KEY, (old) =>
        old
          ? {
              ...old,
              items: old.items.filter((existing) => existing.id !== itemId),
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
