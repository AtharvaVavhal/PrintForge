/** Central path constants — avoids magic strings scattered across
 * <Link>/navigate() calls and keeps App.tsx's route tree and every
 * consumer in sync. */
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  ACCOUNT: '/account',
  ORDERS: '/orders',
  CHECKOUT: '/checkout',
} as const
