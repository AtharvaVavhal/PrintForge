import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { ROUTES } from '@/constants/routes'

interface LogoutButtonProps {
  /** Optional hook that runs after logout resolves, just before the
   * redirect home — used by the mobile header to close the nav drawer
   * (UX-16). */
  onAfterLogout?: () => void
  className?: string
}

/** Logout is an action, not a page (§18) — mounted in the header for an
 * authenticated user (see layouts/Header.tsx). */
export function LogoutButton({ onAfterLogout, className }: LogoutButtonProps = {}) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await logout()
    } finally {
      setIsLoggingOut(false)
      onAfterLogout?.()
      void navigate(ROUTES.HOME)
    }
  }

  return (
    <Button
      variant="ghost"
      isLoading={isLoggingOut}
      onClick={() => void handleLogout()}
      className={className}
    >
      Log out
    </Button>
  )
}
