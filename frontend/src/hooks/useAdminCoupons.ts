import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchAdminCoupons } from '@/services/api/coupons'
import type { ListAdminCouponsParams } from '@/types/coupons'

export const ADMIN_COUPONS_QUERY_KEY = ['admin', 'coupons', 'list'] as const

export function useAdminCoupons(params: ListAdminCouponsParams = {}) {
  return useQuery({
    queryKey: [...ADMIN_COUPONS_QUERY_KEY, params],
    queryFn: () => fetchAdminCoupons(params),
    placeholderData: keepPreviousData,
  })
}
