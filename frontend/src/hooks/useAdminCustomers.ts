import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchAdminCustomers } from '@/services/api/admin'
import type { ListAdminCustomersParams } from '@/types/admin'

export function useAdminCustomers(params: ListAdminCustomersParams = {}) {
  return useQuery({
    queryKey: ['admin', 'customers', 'list', params],
    queryFn: () => fetchAdminCustomers(params),
    placeholderData: keepPreviousData,
  })
}
