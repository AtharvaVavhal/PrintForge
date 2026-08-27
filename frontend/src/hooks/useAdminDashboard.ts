import { useQuery } from '@tanstack/react-query'
import { fetchAdminDashboard } from '@/services/api/admin'

export const ADMIN_DASHBOARD_QUERY_KEY = ['admin', 'dashboard'] as const

export function useAdminDashboard() {
  return useQuery({
    queryKey: ADMIN_DASHBOARD_QUERY_KEY,
    queryFn: fetchAdminDashboard,
  })
}
