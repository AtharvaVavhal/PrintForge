import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { FullPageLoader } from '@/components/ui/FullPageLoader'

/**
 * Client-side UX guard only — every real authorization check happens
 * server-side (BLUEPRINT-v1.2.md §18). Redirects to /login, preserving the
 * attempted location in router state so the login page can send the user
 * back where they were headed.
 *
 * While `status === 'loading'` (the bootstrap refresh from AuthProvider is
 * still in flight) this renders a full-page loading state rather than
 * redirecting — otherwise every hard-reload of a protected route would
 * flash-redirect to /login even for an already-logged-in user, before the
 * refresh cookie has had a chance to re-establish the session. It must not
 * be a blank `null` render either: on a slow connection / cold start that
 * reads as a broken white screen (UX-09).
 */
export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <FullPageLoader />
  }

  if (status === 'unauthenticated') {
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location }} />
  }

  return <Outlet />
}
