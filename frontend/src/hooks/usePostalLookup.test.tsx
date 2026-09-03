import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { usePostalLookup } from './usePostalLookup'

const PUNE = {
  postalCode: '411046',
  city: 'Pune',
  district: 'Pune',
  state: 'Maharashtra',
  country: 'India',
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('usePostalLookup', () => {
  let mock: MockAdapter
  let queryClient: QueryClient

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  afterEach(() => {
    mock.restore()
  })

  it('stays idle and makes no request for fewer than 6 digits', async () => {
    const { result } = renderHook(() => usePostalLookup('4110'), {
      wrapper: createWrapper(queryClient),
    })
    await new Promise((r) => setTimeout(r, 30))
    expect(result.current.status).toBe('idle')
    expect(mock.history.get).toHaveLength(0)
  })

  it('resolves a 6-digit PIN to a normalised location', async () => {
    mock.onGet('/postal-codes/411046').reply(200, { success: true, data: PUNE })
    const { result } = renderHook(() => usePostalLookup('411046'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toEqual(PUNE)
  })

  it('maps a 404 to errorKind "not-found"', async () => {
    mock.onGet('/postal-codes/999999').reply(404, {
      success: false,
      error: { code: 'NOT_FOUND', message: 'nope', details: [] },
    })
    const { result } = renderHook(() => usePostalLookup('999999'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.errorKind).toBe('not-found')
  })

  it('maps a 503 to errorKind "unavailable"', async () => {
    mock.onGet('/postal-codes/560001').reply(503, {
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'down', details: [] },
    })
    const { result } = renderHook(() => usePostalLookup('560001'), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.errorKind).toBe('unavailable')
  })

  it('starts a fresh lookup when the PIN changes', async () => {
    mock.onGet('/postal-codes/411046').reply(200, { success: true, data: PUNE })
    mock.onGet('/postal-codes/400001').reply(200, {
      success: true,
      data: { postalCode: '400001', city: 'Mumbai', district: 'Mumbai', state: 'Maharashtra', country: 'India' },
    })

    const { result, rerender } = renderHook(({ pin }) => usePostalLookup(pin), {
      wrapper: createWrapper(queryClient),
      initialProps: { pin: '411046' },
    })
    await waitFor(() => expect(result.current.data?.city).toBe('Pune'))

    rerender({ pin: '400001' })
    await waitFor(() => expect(result.current.data?.city).toBe('Mumbai'))

    const lookups = mock.history.get.filter((r) => r.url?.includes('/postal-codes/'))
    expect(lookups.map((r) => r.url)).toEqual([
      '/postal-codes/411046',
      '/postal-codes/400001',
    ])
  })

  it('a slow response for a previous PIN never becomes the current result', async () => {
    mock.onGet('/postal-codes/411046').reply(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve([200, { success: true, data: PUNE }]), 200),
        ),
    )
    mock.onGet('/postal-codes/400001').reply(200, {
      success: true,
      data: { postalCode: '400001', city: 'Mumbai', district: 'Mumbai', state: 'Maharashtra', country: 'India' },
    })

    const { result, rerender } = renderHook(({ pin }) => usePostalLookup(pin), {
      wrapper: createWrapper(queryClient),
      initialProps: { pin: '411046' },
    })
    rerender({ pin: '400001' })

    await waitFor(() => expect(result.current.data?.city).toBe('Mumbai'))
    await new Promise((r) => setTimeout(r, 250))
    expect(result.current.data?.city).toBe('Mumbai')
  })

  it('re-uses the cached result for a repeated PIN (no second request)', async () => {
    mock.onGet('/postal-codes/411046').reply(200, { success: true, data: PUNE })

    const { result, rerender } = renderHook(({ pin }) => usePostalLookup(pin), {
      wrapper: createWrapper(queryClient),
      initialProps: { pin: '411046' },
    })
    await waitFor(() => expect(result.current.status).toBe('success'))

    rerender({ pin: '4110' })
    rerender({ pin: '411046' })
    await waitFor(() => expect(result.current.status).toBe('success'))

    expect(
      mock.history.get.filter((r) => r.url === '/postal-codes/411046'),
    ).toHaveLength(1)
  })
})
