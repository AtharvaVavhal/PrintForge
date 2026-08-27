import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { CART_QUERY_KEY } from './useCart'
import { useAddCartItem } from './useAddCartItem'

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useAddCartItem', () => {
  let mock: MockAdapter
  let queryClient: QueryClient

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  afterEach(() => {
    mock.restore()
  })

  it('invalidates the cart query after a successful add (§10 line 377: "invalidated after every mutation")', async () => {
    mock.onPost('/cart/items').reply(201, {
      success: true,
      data: {
        id: 'item-1',
        productId: 'prod-1',
        productName: 'Ceramic Mug',
        variantId: null,
        variantLabel: null,
        quantity: 1,
        unitPrice: '150.00',
        lineTotal: '150.00',
        isAvailable: true,
        unavailableReason: null,
        customizations: [],
      },
      meta: { subtotal: '150.00', itemCount: 1 },
    })

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useAddCartItem(), { wrapper: createWrapper(queryClient) })

    result.current.mutate({ productId: 'prod-1', quantity: 1 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: CART_QUERY_KEY })
  })
})
