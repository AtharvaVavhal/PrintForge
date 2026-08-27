/** Central path constants — avoids magic strings scattered across
 * <Link>/navigate() calls and keeps App.tsx's route tree and every
 * consumer in sync. */
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  PRODUCTS: '/products',
  /** react-router pattern for the detail route — build an actual link with
   * productDetailPath(slug) below, not this constant directly. */
  PRODUCT_DETAIL: '/products/:slug',
  CART: '/cart',
  ACCOUNT: '/account',
  ORDERS: '/orders',
  /** react-router pattern for the detail route — build an actual link with
   * orderDetailPath(id) below, not this constant directly. */
  ORDER_DETAIL: '/orders/:id',
  CHECKOUT: '/checkout',
} as const

export function productDetailPath(slug: string): string {
  return `/products/${encodeURIComponent(slug)}`
}

export function orderDetailPath(id: string): string {
  return `/orders/${encodeURIComponent(id)}`
}
