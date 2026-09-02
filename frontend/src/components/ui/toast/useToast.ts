import { useContext } from 'react'
import { ToastContext, type ToastContextValue } from './toastContext'

/** Storefront transient feedback. Must be called under a <ToastProvider>
 * (mounted in RootLayout), so every public + protected storefront route
 * has it; the admin shell deliberately does not. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}
