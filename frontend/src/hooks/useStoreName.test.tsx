import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { STORE_NAME_FALLBACK, useStoreName } from './useStoreName'

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useStoreName', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })
  afterEach(() => {
    mock.restore()
  })

  it('starts on the "PrintForge" fallback before the request resolves', () => {
    mock.onGet('/settings/storeName').reply(() => new Promise(() => {}))
    const { result } = renderHook(() => useStoreName(), { wrapper: wrapper() })
    expect(result.current).toBe('PrintForge')
    expect(STORE_NAME_FALLBACK).toBe('PrintForge')
  })

  it('returns the configured store name once loaded', async () => {
    mock.onGet('/settings/storeName').reply(200, { success: true, data: { value: 'Atharva Prints' } })
    const { result } = renderHook(() => useStoreName(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current).toBe('Atharva Prints'))
  })

  it('trims whitespace around the configured name', async () => {
    mock
      .onGet('/settings/storeName')
      .reply(200, { success: true, data: { value: '  Atharva Prints  ' } })
    const { result } = renderHook(() => useStoreName(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current).toBe('Atharva Prints'))
  })

  it('falls back to "PrintForge" when the value is null or blank', async () => {
    mock.onGet('/settings/storeName').reply(200, { success: true, data: { value: null } })
    const { result } = renderHook(() => useStoreName(), { wrapper: wrapper() })
    // Give the query a tick to settle; the value stays on the fallback.
    await waitFor(() => expect(result.current).toBe('PrintForge'))
  })

  it('falls back to "PrintForge" when the endpoint errors', async () => {
    mock.onGet('/settings/storeName').reply(500)
    const { result } = renderHook(() => useStoreName(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current).toBe('PrintForge'))
  })
})
