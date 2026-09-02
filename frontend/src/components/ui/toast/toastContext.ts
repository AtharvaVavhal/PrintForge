import { createContext } from 'react'

/** An optional call-to-action rendered inside a toast. Exactly one of
 * `to` (an in-app route) or `onClick` should be set. */
export interface ToastAction {
  label: string
  to?: string
  onClick?: () => void
}

export interface ToastOptions {
  message: string
  /** Visual treatment. `error` is announced assertively; the others politely. */
  variant?: 'success' | 'info' | 'error'
  action?: ToastAction
  /** Auto-dismiss delay in ms. Defaults to 5000, or 8000 when an action is
   * present so there is time to reach it. Pass 0 to disable auto-dismiss. */
  duration?: number
}

export interface ToastContextValue {
  showToast: (options: ToastOptions) => void
}

/** Split from ToastProvider.tsx so that file exports only its component
 * (react-refresh/only-export-components — same split as authContext.ts). */
export const ToastContext = createContext<ToastContextValue | null>(null)
