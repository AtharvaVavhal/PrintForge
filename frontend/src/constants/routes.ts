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
  /** Landed on by AdminRoute when a logged-in non-admin hits an /admin/*
   * route — a distinct "not authorized" outcome, not a redirect to LOGIN
   * (which would falsely imply they're logged out). */
  FORBIDDEN: '/forbidden',
  ADMIN_DASHBOARD: '/admin',
  ADMIN_ORDERS: '/admin/orders',
  /** react-router pattern — build an actual link with
   * adminOrderDetailPath(id) below, not this constant directly. */
  ADMIN_ORDER_DETAIL: '/admin/orders/:id',
  ADMIN_CUSTOMERS: '/admin/customers',
  /** react-router pattern — build an actual link with
   * adminCustomerDetailPath(id) below, not this constant directly. */
  ADMIN_CUSTOMER_DETAIL: '/admin/customers/:id',
  ADMIN_PRODUCTS: '/admin/products',
  /** react-router pattern — build an actual link with
   * adminProductDetailPath(id) below, not this constant directly. `:id`
   * also matches the literal segment "new" (adminProductDetailPath('new')
   * from AdminProductsPage's "New product" button) — AdminProductDetailPage
   * special-cases that value into create mode, since there's no separate
   * create route (GET /products/:id doesn't exist either way — see that
   * page's own doc comment for why create/edit share one route). */
  ADMIN_PRODUCT_DETAIL: '/admin/products/:id',
  ADMIN_CATEGORIES: '/admin/categories',
} as const

export function productDetailPath(slug: string): string {
  return `/products/${encodeURIComponent(slug)}`
}

export function orderDetailPath(id: string): string {
  return `/orders/${encodeURIComponent(id)}`
}

export function adminOrderDetailPath(id: string): string {
  return `/admin/orders/${encodeURIComponent(id)}`
}

export function adminCustomerDetailPath(id: string): string {
  return `/admin/customers/${encodeURIComponent(id)}`
}

export function adminProductDetailPath(id: string): string {
  return `/admin/products/${encodeURIComponent(id)}`
}
