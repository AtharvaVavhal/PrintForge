import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from './client'
import { clearAuth, getAccessToken } from './authStore'
import { useUpdateCartItem } from '@/hooks/useUpdateCartItem'
import { useRemoveCartItem } from '@/hooks/useRemoveCartItem'

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

/**
 * client.test.ts:35-84 proves the single-flight-refresh guarantee against a
 * generic GET /protected endpoint fired directly through apiClient. This
 * file proves the same guarantee holds for real cart mutation traffic:
 * two different verbs (PATCH + DELETE) against two different cart lines,
 * driven through the actual useUpdateCartItem/useRemoveCartItem hooks —
 * not raw apiClient calls — matching how two separate CartLineItem
 * instances (each with its own mutation hook, CartLineItem.tsx) firing
 * near-simultaneous requests would behave in the real app.
 *
 * This is coverage only — no production code changes expected. The
 * interceptor (client.ts) is endpoint/method-agnostic by construction, so
 * this is expected to pass as-is; if it doesn't, that's a real bug, not a
 * reason to weaken the test.
 */
describe('cart mutations under a concurrent 401 burst', () => {
  let apiMock: MockAdapter
  let rootMock: MockAdapter
  let queryClient: QueryClient

  beforeEach(() => {
    clearAuth()
    apiMock = new MockAdapter(apiClient)
    rootMock = new MockAdapter(axios)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  afterEach(() => {
    apiMock.restore()
    rootMock.restore()
  })

  it('shares a single refresh across a concurrent PATCH + DELETE that both 401, and retries both to success', async () => {
    let refreshCallCount = 0
    rootMock.onPost('/auth/refresh').reply(() => {
      refreshCallCount += 1
      return [
        200,
        {
          success: true,
          data: {
            accessToken: 'fresh-token',
            user: {
              id: 'user-1',
              email: 'shopper@example.test',
              role: 'CUSTOMER',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          },
        },
      ]
    })

    // Each endpoint 401s until the request carries the post-refresh token —
    // a genuinely expired access token, not a canned call-count trick.
    apiMock.onPatch('/cart/items/item-a').reply((config) => {
      if (config.headers?.Authorization === 'Bearer fresh-token') {
        return [
          200,
          {
            success: true,
            data: {
              id: 'item-a',
              productId: 'prod-a',
              productName: 'Ceramic Mug',
              variantId: null,
              variantLabel: null,
              quantity: 3,
              unitPrice: '150.00',
              lineTotal: '450.00',
              isAvailable: true,
              unavailableReason: null,
              customizations: [],
            },
            meta: { subtotal: '450.00', itemCount: 3 },
          },
        ]
      }
      return [
        401,
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', details: [] } },
      ]
    })
    apiMock.onDelete('/cart/items/item-b').reply((config) => {
      if (config.headers?.Authorization === 'Bearer fresh-token') {
        return [
          200,
          {
            success: true,
            data: { message: 'Item removed from cart' },
            meta: { subtotal: '450.00', itemCount: 3 },
          },
        ]
      }
      return [
        401,
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', details: [] } },
      ]
    })

    const wrapper = createWrapper(queryClient)
    const { result: updateResult } = renderHook(() => useUpdateCartItem(), { wrapper })
    const { result: removeResult } = renderHook(() => useRemoveCartItem(), { wrapper })

    // Fired in the same tick, no await between them — genuinely concurrent
    // requests racing to hit 401 together, not a sequential retry-after-fail.
    updateResult.current.mutate({ itemId: 'item-a', quantity: 3 })
    removeResult.current.mutate('item-b')

    await waitFor(() => {
      expect(updateResult.current.isSuccess).toBe(true)
      expect(removeResult.current.isSuccess).toBe(true)
    })

    expect(refreshCallCount).toBe(1)
    expect(getAccessToken()).toBe('fresh-token')
  })

  it('logs out directly with no second refresh attempt when the refresh call itself 401s', async () => {
    let refreshCallCount = 0
    rootMock.onPost('/auth/refresh').reply(() => {
      refreshCallCount += 1
      return [
        401,
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token', details: [] } },
      ]
    })
    apiMock.onPatch('/cart/items/item-a').reply(401, {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized', details: [] },
    })
    apiMock.onDelete('/cart/items/item-b').reply(401, {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized', details: [] },
    })

    const wrapper = createWrapper(queryClient)
    const { result: updateResult } = renderHook(() => useUpdateCartItem(), { wrapper })
    const { result: removeResult } = renderHook(() => useRemoveCartItem(), { wrapper })

    updateResult.current.mutate({ itemId: 'item-a', quantity: 3 })
    removeResult.current.mutate('item-b')

    await waitFor(() => {
      expect(updateResult.current.isError).toBe(true)
      expect(removeResult.current.isError).toBe(true)
    })

    // Exactly one refresh attempt — no recursive retry after the refresh
    // endpoint's own 401, and the second mutation's concurrent failure
    // didn't trigger a redundant second attempt either.
    expect(refreshCallCount).toBe(1)
    expect(getAccessToken()).toBeNull()
  })
})
