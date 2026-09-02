import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { ToastContext, type ToastOptions } from './toastContext'
import styles from './ToastProvider.module.css'

interface ActiveToast extends ToastOptions {
  id: number
}

/** How many toasts render at once — the oldest is dropped past this. */
const MAX_VISIBLE = 3
const DEFAULT_DURATION = 5000
const DEFAULT_DURATION_WITH_ACTION = 8000

/**
 * Lightweight storefront toast host. A single persistent `aria-live`
 * region (mounted before any toast so screen readers reliably announce
 * insertions), holding a small stack of auto-dismissing messages, each
 * with an optional action and a manual close button. Deliberately minimal
 * — no queueing, no animation beyond a CSS fade, no swipe. Rendered via a
 * portal to `document.body` so it sits above page layout regardless of
 * where `showToast` was called.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((options: ToastOptions) => {
    const id = nextId.current++
    setToasts((current) => {
      const next = [...current, { ...options, id }]
      return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next
    })

    const duration =
      options.duration ??
      (options.action ? DEFAULT_DURATION_WITH_ACTION : DEFAULT_DURATION)
    if (duration > 0) {
      const timer = setTimeout(() => {
        timers.current.delete(id)
        setToasts((current) => current.filter((toast) => toast.id !== id))
      }, duration)
      timers.current.set(id, timer)
    }
  }, [])

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            className={styles.viewport}
            role="status"
            aria-live="polite"
            aria-atomic="false"
          >
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className={cn(styles.toast, styles[toast.variant ?? 'success'])}
              >
                <p className={styles.message}>{toast.message}</p>
                {toast.action && (
                  <span className={styles.actionSlot}>
                    {toast.action.to ? (
                      <Link
                        to={toast.action.to}
                        className={styles.action}
                        onClick={() => {
                          toast.action?.onClick?.()
                          dismiss(toast.id)
                        }}
                      >
                        {toast.action.label}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={styles.action}
                        onClick={() => {
                          toast.action?.onClick?.()
                          dismiss(toast.id)
                        }}
                      >
                        {toast.action.label}
                      </button>
                    )}
                  </span>
                )}
                <button
                  type="button"
                  className={styles.close}
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss notification"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}
