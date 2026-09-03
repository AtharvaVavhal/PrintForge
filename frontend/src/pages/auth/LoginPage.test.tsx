import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthContextValue } from '@/features/auth/authContext'
import { ToastProvider } from '@/components/ui/toast/ToastProvider'
import {
  createMockAuthContext,
  createTestQueryClient,
  renderWithProviders,
} from '@/test/test-utils'
import { RegisterPage } from './RegisterPage'
import { LoginPage } from './LoginPage'

/** Renders the real /login → "Sign up" → /register → (register) → destination
 * chain so the router-state hop is exercised end to end (UX-04). */
function renderAuthChain(
  loginState: unknown,
  authValue: AuthContextValue = createMockAuthContext(),
) {
  function Echo({ label }: { label: string }) {
    const loc = useLocation()
    return <div>{label}{loc.search}</div>
  }
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: loginState }]}>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/checkout" element={<Echo label="Checkout page" />} />
              <Route path="/products" element={<Echo label="Products page" />} />
              <Route path="/" element={<Echo label="Home page" />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

describe('LoginPage', () => {
  it('shows validation errors for an invalid email and empty password', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(await screen.findByText('Password is required')).toBeInTheDocument()
  })

  it('does not call login when the form is invalid', async () => {
    const user = userEvent.setup()
    const authValue = createMockAuthContext()
    renderWithProviders(<LoginPage />, { authValue })

    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await screen.findByText('Enter a valid email address')
    expect(authValue.login).not.toHaveBeenCalled()
  })

  it('calls login with the entered credentials once validation passes', async () => {
    const user = userEvent.setup()
    const authValue = createMockAuthContext()
    renderWithProviders(<LoginPage />, { authValue })

    await user.type(screen.getByLabelText('Email'), 'shopper@example.test')
    await user.type(screen.getByLabelText('Password'), 'whatever-they-typed')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => {
      expect(authValue.login).toHaveBeenCalledWith('shopper@example.test', 'whatever-they-typed')
    })
  })

  it('reveals/hides the password without submitting or losing the value (UX-23)', async () => {
    const user = userEvent.setup()
    const authValue = createMockAuthContext()
    renderWithProviders(<LoginPage />, { authValue })

    const password = screen.getByLabelText('Password')
    await user.type(password, 's3cret-pw')
    expect(password).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveValue('s3cret-pw')
    expect(authValue.login).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')

    // Login page has no password policy, so it shows no requirements list.
    expect(screen.queryByRole('list', { name: 'Password requirements' })).not.toBeInTheDocument()
  })

  describe('UX-04 — Sign-up link forwards the redirect state to /register', () => {
    async function completeRegister(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('link', { name: 'Sign up' }))
      expect(await screen.findByRole('button', { name: 'Create account' })).toBeInTheDocument()
      await user.type(screen.getByLabelText('Email'), 'newshopper@example.test')
      await user.type(screen.getByLabelText('Password', { exact: true }), 'CorrectHorseBattery9!')
      await user.type(screen.getByLabelText('Confirm password'), 'CorrectHorseBattery9!')
      await user.click(screen.getByRole('button', { name: 'Create account' }))
    }

    it('carries state.from=/checkout through Sign up → register → back to /checkout', async () => {
      const user = userEvent.setup()
      const authValue = createMockAuthContext()
      renderAuthChain({ from: { pathname: '/checkout', search: '' } }, authValue)

      await completeRegister(user)

      expect(await screen.findByText('Checkout page')).toBeInTheDocument()
      expect(screen.queryByText('Home page')).not.toBeInTheDocument()
      expect(authValue.register).toHaveBeenCalledWith(
        'newshopper@example.test',
        'CorrectHorseBattery9!',
      )
    })

    it('preserves the query string of the intended destination', async () => {
      const user = userEvent.setup()
      renderAuthChain({ from: { pathname: '/products', search: '?category=mugs' } })

      await completeRegister(user)

      expect(await screen.findByText('Products page?category=mugs')).toBeInTheDocument()
    })

    it('falls back to home when the login page was reached directly (no state)', async () => {
      const user = userEvent.setup()
      renderAuthChain(null)

      await completeRegister(user)

      expect(await screen.findByText('Home page')).toBeInTheDocument()
    })
  })
})
