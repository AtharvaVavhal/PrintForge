import type { PublicUser } from '@/types/auth'

/**
 * Single source of truth for the access token and current user — a plain
 * module-level store, deliberately outside React (BLUEPRINT-v1.2.md §18).
 * The access token lives ONLY here, in memory: never localStorage, never
 * sessionStorage, never a cookie this frontend sets itself. It's read
 * directly by client.ts's request interceptor (which isn't a component and
 * can't call a hook), and surfaced to React via features/auth/AuthContext.tsx
 * through useSyncExternalStore, so both consumers share one state instead
 * of drifting.
 *
 * The refresh token is an HttpOnly cookie the backend sets and the browser
 * sends automatically on same-site requests (withCredentials — see
 * client.ts); nothing in this frontend ever reads or writes it.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthState {
  accessToken: string | null
  user: PublicUser | null
  status: AuthStatus
}

let state: AuthState = { accessToken: null, user: null, status: 'loading' }
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function getAuthState(): AuthState {
  return state
}

export function getAccessToken(): string | null {
  return state.accessToken
}

/** Subscribed by useSyncExternalStore (features/auth/AuthContext.tsx). */
export function subscribeAuthState(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setAuthenticated(user: PublicUser, accessToken: string): void {
  state = { accessToken, user, status: 'authenticated' }
  emit()
}

export function clearAuth(): void {
  state = { accessToken: null, user: null, status: 'unauthenticated' }
  emit()
}
