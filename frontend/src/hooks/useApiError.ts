import { useCallback, useState } from 'react'
import { parseApiError, type ParsedApiError } from '@/utils/apiError'

export interface UseApiErrorResult {
  error: ParsedApiError | null
  /** Convenience — the common case only needs the message string. */
  message: string | null
  /** Parses `err` via parseApiError, stores it, and returns the parsed
   * result — call this from a catch block instead of parsing axios errors
   * ad hoc in each component (§18 Phase 1 item 6). */
  captureError: (err: unknown) => ParsedApiError
  /** For a purely client-side validation message that never came from the
   * API (e.g. ResetPasswordPage's "this link is missing its token") —
   * keeps every form on one error-display code path instead of a second
   * ad hoc string state next to this hook. */
  setCustomError: (message: string) => void
  clearError: () => void
}

export function useApiError(): UseApiErrorResult {
  const [error, setError] = useState<ParsedApiError | null>(null)

  const captureError = useCallback((err: unknown): ParsedApiError => {
    const parsed = parseApiError(err)
    setError(parsed)
    return parsed
  }, [])

  const setCustomError = useCallback((message: string) => {
    setError({ code: 'CLIENT_ERROR', message, details: [] })
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return { error, message: error?.message ?? null, captureError, setCustomError, clearError }
}
