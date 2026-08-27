import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { createMockAuthContext, renderWithProviders } from '@/test/test-utils'
import type { CartItemView, CartView } from '@/types/cart'
import { CartPage } from './CartPage'

const AUTH_VALUE = createMockAuthContext({
  status: 'authenticated',
  user: { id: 'user-1', email: 'shopper@example.test', role: 'CUSTOMER', createdAt: '2026-01-01T00:00:00.000Z' },
})

function buildItem(overrides: Partial<CartItemView> = {}): CartItemView {
  return {
    id: 'item-1',
    productId: 'prod-1',
    productName: 'Ceramic Mug',
    variantId: null,
    variantLabel: null,
    quantity: 2,
    unitPrice: '150.00',
    lineTotal: '300.00',
    isAvailable: true,
    unavailableReason: null,
    customizations: [],
    ...overrides,
  }
}

function buildCart(items: CartItemView[]): CartView {
  return {
    id: 'cart-1',
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + Number(item.lineTotal), 0).toFixed(2),
  }
}

function render(ui: React.ReactElement) {
  return renderWithProviders(ui, { authValue: AUTH_VALUE })
}

describe('CartPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  it('renders items, quantities, line totals, and the subtotal', async () => {
    const cart = buildCart([
      buildItem(),
      buildItem({ id: 'item-2', productName: 'Photo Frame', quantity: 1, unitPrice: '80.00', lineTotal: '80.00' }),
    ])
    mock.onGet('/cart').reply(200, { success: true, data: cart })

    render(<CartPage />)

    expect(await screen.findByText('Ceramic Mug')).toBeInTheDocument()
    expect(screen.getByText('Photo Frame')).toBeInTheDocument()
    expect(screen.getAllByRole('spinbutton', { name: 'Quantity' })[0]).toHaveValue(2)
    expect(screen.getByText('₹300.00')).toBeInTheDocument() // Ceramic Mug's line total
    expect(screen.getByText('₹80.00')).toBeInTheDocument() // Photo Frame's line total
    expect(screen.getByText('₹150.00 each')).toBeInTheDocument()
    expect(screen.getByText('₹380.00')).toBeInTheDocument() // subtotal, distinct from either line total
    expect(screen.getByText('3')).toBeInTheDocument() // itemCount in summary (2 + 1)
  })

  it('renders the empty-cart state when there are no items', async () => {
    mock.onGet('/cart').reply(200, { success: true, data: buildCart([]) })

    render(<CartPage />)

    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument()
  })

  it('renders an error state when the cart request fails', async () => {
    mock.onGet('/cart').reply(500, {
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something broke', details: [] },
    })

    render(<CartPage />)

    expect(await screen.findByText('Something broke')).toBeInTheDocument()
  })

  it('renders the unavailable-item state distinctly and blocks checkout', async () => {
    const cart = buildCart([
      buildItem({ id: 'item-1' }),
      buildItem({
        id: 'item-2',
        productName: 'Discontinued Product',
        isAvailable: false,
        unavailableReason: 'PRODUCT_INACTIVE',
      }),
    ])
    mock.onGet('/cart').reply(200, { success: true, data: cart })

    render(<CartPage />)

    expect(await screen.findByText('This product is no longer available.')).toBeInTheDocument()
    expect(
      screen.getByText('Remove the unavailable item(s) above before checking out.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Proceed to checkout' })).toBeDisabled()
  })

  it('allows checkout when every item is available', async () => {
    mock.onGet('/cart').reply(200, { success: true, data: buildCart([buildItem()]) })

    render(<CartPage />)

    expect(await screen.findByRole('link', { name: 'Proceed to checkout' })).toBeInTheDocument()
  })

  it('updates the quantity via PATCH and reflects the new line total', async () => {
    const user = userEvent.setup()
    mock.onGet('/cart').replyOnce(200, { success: true, data: buildCart([buildItem()]) })

    render(<CartPage />)
    await screen.findByText('Ceramic Mug')

    const updatedItem = buildItem({ quantity: 3, lineTotal: '450.00' })
    mock.onPatch('/cart/items/item-1').reply(200, {
      success: true,
      data: updatedItem,
      meta: { subtotal: '450.00', itemCount: 3 },
    })
    // useUpdateCartItem now invalidates the cart query after success (§10
    // line 377), so a real follow-up GET /cart happens — it must reflect
    // the same post-mutation state the PATCH response already did.
    mock.onGet('/cart').reply(200, { success: true, data: buildCart([updatedItem]) })

    await user.click(screen.getByRole('button', { name: /increase/i }))

    await waitFor(() => {
      // Both the line total and the subtotal are ₹450.00 here — correctly,
      // since it's the only line in the cart.
      expect(screen.getAllByText('₹450.00')).toHaveLength(2)
    })
    expect(mock.history.patch).toHaveLength(1)
    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({ quantity: 3 })
  })

  it('surfaces the server validation error when a quantity update is rejected', async () => {
    const user = userEvent.setup()
    mock.onGet('/cart').reply(200, { success: true, data: buildCart([buildItem()]) })

    render(<CartPage />)
    await screen.findByText('Ceramic Mug')

    mock.onPatch('/cart/items/item-1').reply(400, {
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Quantity must be between 1 and 2 for this product', details: [] },
    })

    await user.click(screen.getByRole('button', { name: /increase/i }))

    expect(
      await screen.findByText('Quantity must be between 1 and 2 for this product'),
    ).toBeInTheDocument()
    // Cache untouched on failure — quantity display reverts to the last
    // server-confirmed value rather than trusting the failed optimistic bump.
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue(2)
  })

  it('removes a line via DELETE and updates the subtotal', async () => {
    const user = userEvent.setup()
    mock.onGet('/cart').replyOnce(200, { success: true, data: buildCart([buildItem()]) })

    render(<CartPage />)
    await screen.findByText('Ceramic Mug')

    mock.onDelete('/cart/items/item-1').reply(200, {
      success: true,
      data: { message: 'Item removed from cart' },
      meta: { subtotal: '0.00', itemCount: 0 },
    })
    // useRemoveCartItem now invalidates the cart query after success (§10
    // line 377) — the follow-up GET /cart must reflect the item's removal.
    mock.onGet('/cart').reply(200, { success: true, data: buildCart([]) })

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
    })
    expect(mock.history.delete).toHaveLength(1)
  })
})
