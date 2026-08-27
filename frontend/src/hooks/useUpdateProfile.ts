import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateProfile } from '@/services/api/auth'
import type { UserProfileView } from '@/types/auth'
import { USER_PROFILE_QUERY_KEY } from './useCurrentUser'

/** Same dual strategy as useUpdateCartItem: patch the cache directly from
 * the mutation's own response (PATCH /users/me returns the full updated
 * profile, so no follow-up GET is needed for the view to reflect it
 * instantly) and invalidate on top of that for eventual correctness
 * (§10 line 377's "invalidated after every mutation" convention). */
export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData<UserProfileView>(USER_PROFILE_QUERY_KEY, profile)
      void queryClient.invalidateQueries({ queryKey: USER_PROFILE_QUERY_KEY })
    },
  })
}
