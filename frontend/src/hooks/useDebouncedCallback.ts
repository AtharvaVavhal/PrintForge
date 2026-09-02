import { useEffect, useMemo, useRef } from 'react'

interface DebouncedControls {
  /** Run any pending call now (e.g. on blur / Enter). */
  flush: () => void
  /** Drop any pending call. */
  cancel: () => void
}

/**
 * Returns `[debounced, controls]`. Rapid calls to `debounced(...)` collapse
 * into one, fired `delay` ms after the last call — used for the price-range
 * filter so typing "1500" is one URL update / refetch instead of four
 * (UX-10). The pending timer is cleared on unmount.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number,
): [(...args: Args) => void, DebouncedControls] {
  const callbackRef = useRef(callback)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pendingArgsRef = useRef<Args>(undefined)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  return useMemo(() => {
    const clear = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = undefined
    }

    const debounced = (...args: Args) => {
      pendingArgsRef.current = args
      clear()
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined
        pendingArgsRef.current = undefined
        callbackRef.current(...args)
      }, delay)
    }

    const controls: DebouncedControls = {
      flush: () => {
        clear()
        if (pendingArgsRef.current) {
          const args = pendingArgsRef.current
          pendingArgsRef.current = undefined
          callbackRef.current(...args)
        }
      },
      cancel: () => {
        clear()
        pendingArgsRef.current = undefined
      },
    }

    return [debounced, controls]
  }, [delay])
}
