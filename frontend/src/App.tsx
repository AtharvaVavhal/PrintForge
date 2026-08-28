import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { queryClient } from '@/services/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { AdminRoute } from '@/features/auth/AdminRoute'
import { RootLayout } from '@/layouts/RootLayout'
import { HomePage } from '@/pages/home/HomePage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { ProductListPage } from '@/pages/catalog/ProductListPage'
import { ProductDetailPage } from '@/pages/catalog/ProductDetailPage'
import { CartPage } from '@/pages/cart/CartPage'
import { AccountPage } from '@/pages/account/AccountPage'
import { OrdersPage } from '@/pages/orders/OrdersPage'
import { OrderDetailPage } from '@/pages/orders/OrderDetailPage'
import { CheckoutPage } from '@/pages/checkout/CheckoutPage'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminOrdersPage } from '@/pages/admin/AdminOrdersPage'
import { AdminOrderDetailPage } from '@/pages/admin/AdminOrderDetailPage'
import { AdminCustomersPage } from '@/pages/admin/AdminCustomersPage'
import { AdminCustomerDetailPage } from '@/pages/admin/AdminCustomerDetailPage'
import { AdminProductsPage } from '@/pages/admin/AdminProductsPage'
import { AdminProductDetailPage } from '@/pages/admin/AdminProductDetailPage'
import { AdminCategoriesPage } from '@/pages/admin/AdminCategoriesPage'
import { AdminCouponsPage } from '@/pages/admin/AdminCouponsPage'
import { ForbiddenPage } from '@/pages/forbidden/ForbiddenPage'
import { NotFoundPage } from '@/pages/not-found/NotFoundPage'
import { ROUTES } from '@/constants/routes'

/**
 * Router shell (§18). Public and protected routes are structurally
 * separate here: public routes sit directly under RootLayout, protected
 * routes are grouped under a second nested <Route> wrapped in
 * <ProtectedRoute> (a layout-route guard) — so which routes require auth
 * is visible from the tree shape itself, not from a per-page check.
 */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<RootLayout />}>
              {/* Public routes */}
              <Route path={ROUTES.HOME} element={<HomePage />} />
              <Route path={ROUTES.LOGIN} element={<LoginPage />} />
              <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
              <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPasswordPage />} />
              <Route path={ROUTES.RESET_PASSWORD} element={<ResetPasswordPage />} />
              <Route path={ROUTES.PRODUCTS} element={<ProductListPage />} />
              <Route path={ROUTES.PRODUCT_DETAIL} element={<ProductDetailPage />} />
              <Route path={ROUTES.FORBIDDEN} element={<ForbiddenPage />} />

              {/* Protected routes */}
              <Route element={<ProtectedRoute />}>
                <Route path={ROUTES.CART} element={<CartPage />} />
                <Route path={ROUTES.ACCOUNT} element={<AccountPage />} />
                <Route path={ROUTES.ORDERS} element={<OrdersPage />} />
                <Route path={ROUTES.ORDER_DETAIL} element={<OrderDetailPage />} />
                <Route path={ROUTES.CHECKOUT} element={<CheckoutPage />} />
              </Route>

              {/* Admin routes — authentication AND role === 'ADMIN'
                  (AdminRoute), a strict superset of ProtectedRoute's check. */}
              <Route element={<AdminRoute />}>
                <Route path={ROUTES.ADMIN_DASHBOARD} element={<AdminDashboardPage />} />
                <Route path={ROUTES.ADMIN_ORDERS} element={<AdminOrdersPage />} />
                <Route path={ROUTES.ADMIN_ORDER_DETAIL} element={<AdminOrderDetailPage />} />
                <Route path={ROUTES.ADMIN_CUSTOMERS} element={<AdminCustomersPage />} />
                <Route path={ROUTES.ADMIN_CUSTOMER_DETAIL} element={<AdminCustomerDetailPage />} />
                <Route path={ROUTES.ADMIN_PRODUCTS} element={<AdminProductsPage />} />
                <Route path={ROUTES.ADMIN_PRODUCT_DETAIL} element={<AdminProductDetailPage />} />
                <Route path={ROUTES.ADMIN_CATEGORIES} element={<AdminCategoriesPage />} />
                <Route path={ROUTES.ADMIN_COUPONS} element={<AdminCouponsPage />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
