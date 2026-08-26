import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { queryClient } from '@/services/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { RootLayout } from '@/layouts/RootLayout'
import { HomePage } from '@/pages/home/HomePage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { ProductListPage } from '@/pages/catalog/ProductListPage'
import { ProductDetailPage } from '@/pages/catalog/ProductDetailPage'
import { AccountPage } from '@/pages/account/AccountPage'
import { OrdersPage } from '@/pages/orders/OrdersPage'
import { CheckoutPage } from '@/pages/checkout/CheckoutPage'
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

              {/* Protected routes */}
              <Route element={<ProtectedRoute />}>
                <Route path={ROUTES.ACCOUNT} element={<AccountPage />} />
                <Route path={ROUTES.ORDERS} element={<OrdersPage />} />
                <Route path={ROUTES.CHECKOUT} element={<CheckoutPage />} />
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
