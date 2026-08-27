import { useQuery } from '@tanstack/react-query'
import { fetchCurrentUser } from '@/services/api/auth'

export const USER_PROFILE_QUERY_KEY = ['users', 'me'] as const

/** Extracted from AccountPage's previous inline useQuery so useUpdateProfile
 * can invalidate/patch the exact same key — same pairing as useCart +
 * useUpdateCartItem. AccountPage sits behind ProtectedRoute (App.tsx), so
 * unlike useCart this doesn't need its own auth-status `enabled` gate. */
export function useCurrentUser() {
  return useQuery({
    queryKey: USER_PROFILE_QUERY_KEY,
    queryFn: fetchCurrentUser,
  })
}
