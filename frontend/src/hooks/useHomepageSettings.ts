import { useQuery } from '@tanstack/react-query'
import { fetchHomepageSettings, type HomepageSettings } from '@/services/api/settings'
import { CATALOG_STALE_TIME_MS } from '@/constants/query'

export function useHomepageSettings() {
  return useQuery<HomepageSettings>({
    queryKey: ['homepage', 'settings'],
    queryFn: fetchHomepageSettings,
    staleTime: CATALOG_STALE_TIME_MS,
  })
}
