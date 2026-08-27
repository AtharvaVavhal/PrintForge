import { useQuery } from '@tanstack/react-query'
import { fetchAdminCustomer } from '@/services/api/admin'

export function useAdminCustomer(customerId: string) {
  return useQuery({
    queryKey: ['admin', 'customers', customerId],
    queryFn: () => fetchAdminCustomer(customerId),
  })
}
