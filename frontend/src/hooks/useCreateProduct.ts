import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createProduct } from '@/services/api/catalog'

/** Invalidates the products list on success — the newly-created product's
 * own detail view is seeded directly from this mutation's response
 * (navigate with it in router state), not a refetch (there's no
 * GET /products/:id to refetch from — see AdminProductsPage's doc comment). */
export function useCreateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'list'] })
    },
  })
}
