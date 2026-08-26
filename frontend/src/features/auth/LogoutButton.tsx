import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { ROUTES } from '@/constants/routes'

/** Logout is an action, not a page (§18) — mounted in the header for an
 * authenticated user (see layouts/Header.tsx). */
export function LogoutButton() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await logout()
    } finally {
      setIsLoggingOut(false)
      void navigate(ROUTES.HOME)
    }
  }

  return (
    <Button variant="ghost" isLoading={isLoggingOut} onClick={() => void handleLogout()}>
      Log out
    </Button>
  )
}
