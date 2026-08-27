import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addCartItem } from '@/services/api/cart'
import type { CartView } from '@/types/cart'
import { CART_QUERY_KEY } from './useCart'

/**
 * Patches the cached CartView in place from the mutation's own response
 * (item + meta) instead of invalidating and refetching — cart.controller.ts
 * deliberately returns both specifically "so the frontend doesn't need a
 * follow-up GET /cart after every mutation." Every value used here (item,
 * subtotal, itemCount) is server-computed, not client-derived — this is a
 * cache-write optimization, not an optimistic UI that guesses at price.
 *
 * If the cart was never fetched yet (cache empty — e.g. adding from a
 * product page before ever visiting /cart), there's nothing to patch: we
 * don't have the rest of the cart's items to reconstruct a full CartView,
 * so this is a no-op and the next real useCart() mount does a normal fetch.
 */
export function useAddCartItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: addCartItem,
    onSuccess: ({ item, meta }) => {
      queryClient.setQueryData<CartView>(CART_QUERY_KEY, (old) =>
        old
          ? { ...old, items: [...old.items, item], subtotal: meta.subtotal, itemCount: meta.itemCount }
          : old,
      )
      // §10 line 377: "invalidated after every mutation." The setQueryData
      // patch above is only an instant-UI optimization from this mutation's
      // own response — invalidating too guarantees eventual correctness
      // (e.g. two mutations on different lines resolving out of order can't
      // leave a stale subtotal/itemCount sitting past the next refetch).
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
    },
  })
}
