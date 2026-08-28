import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateCoupon } from '@/services/api/coupons'
import type { UpdateCouponPayload } from '@/types/coupons'
import { ADMIN_COUPONS_QUERY_KEY } from './useAdminCoupons'

export function useUpdateCoupon() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCouponPayload }) =>
      updateCoupon(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_COUPONS_QUERY_KEY })
    },
  })
}
