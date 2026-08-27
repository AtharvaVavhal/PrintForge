import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { CART_QUERY_KEY } from './useCart'
import { useUpdateCartItem } from './useUpdateCartItem'

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useUpdateCartItem', () => {
  let mock: MockAdapter
  let queryClient: QueryClient

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  afterEach(() => {
    mock.restore()
  })

  it('invalidates the cart query after a successful update (§10 line 377: "invalidated after every mutation")', async () => {
    mock.onPatch('/cart/items/item-1').reply(200, {
      success: true,
      data: {
        id: 'item-1',
        productId: 'prod-1',
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
    })

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateCartItem(), {
      wrapper: createWrapper(queryClient),
    })

    result.current.mutate({ itemId: 'item-1', quantity: 3 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: CART_QUERY_KEY })
  })
})
