import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createCoupon } from '@/services/api/coupons'
import { ADMIN_COUPONS_QUERY_KEY } from './useAdminCoupons'

export function useCreateCoupon() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createCoupon,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_COUPONS_QUERY_KEY })
    },
  })
}
