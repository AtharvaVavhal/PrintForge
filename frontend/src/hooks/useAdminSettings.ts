import { useQuery } from '@tanstack/react-query'
import { fetchAdminSettings } from '@/services/api/settings'

export function useAdminSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: fetchAdminSettings,
  })
}
