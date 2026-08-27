import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { CART_QUERY_KEY } from './useCart'
import { useRemoveCartItem } from './useRemoveCartItem'

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useRemoveCartItem', () => {
  let mock: MockAdapter
  let queryClient: QueryClient

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  afterEach(() => {
    mock.restore()
  })

  it('invalidates the cart query after a successful removal (§10 line 377: "invalidated after every mutation")', async () => {
    mock.onDelete('/cart/items/item-1').reply(200, {
      success: true,
      data: { message: 'Item removed from cart' },
      meta: { subtotal: '0.00', itemCount: 0 },
    })

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useRemoveCartItem(), {
      wrapper: createWrapper(queryClient),
    })

    result.current.mutate('item-1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: CART_QUERY_KEY })
  })
})
