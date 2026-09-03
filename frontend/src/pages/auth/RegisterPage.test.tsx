import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '@/features/auth/authContext'
import { ToastProvider } from '@/components/ui/toast/ToastProvider'
import {
  createMockAuthContext,
  createTestQueryClient,
  renderWithProviders,
} from '@/test/test-utils'
import { RegisterPage } from './RegisterPage'

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  { email = 'shopper@example.test', password, confirmPassword }: {
    email?: string
    password: string
    confirmPassword: string
  },
) {
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.type(screen.getByLabelText('Confirm password'), confirmPassword)
  await user.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('RegisterPage', () => {
  it('rejects a password shorter than 8 characters', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RegisterPage />)

    await fillAndSubmit(user, { password: 'short1a', confirmPassword: 'short1a' })

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
  })

  it('rejects a purely numeric password', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RegisterPage />)

    await fillAndSubmit(user, { password: '12345678', confirmPassword: '12345678' })

    expect(await screen.findByText('Password must not be purely numeric')).toBeInTheDocument()
  })

  it('rejects a common password', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RegisterPage />)

    await fillAndSubmit(user, { password: 'password123', confirmPassword: 'password123' })

    expect(
      await screen.findByText('This password is too common — please choose another'),
    ).toBeInTheDocument()
  })

  it('rejects a mismatched password confirmation', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RegisterPage />)

    await fillAndSubmit(user, {
      password: 'CorrectHorseBattery9!',
      confirmPassword: 'ADifferentPassword1!',
    })

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
  })

  it('does not call register when the form is invalid', async () => {
    const user = userEvent.setup()
    const authValue = createMockAuthContext()
    renderWithProviders(<RegisterPage />, { authValue })

    await fillAndSubmit(user, { password: '12345678', confirmPassword: '12345678' })

    await screen.findByText('Password must not be purely numeric')
    expect(authValue.register).not.toHaveBeenCalled()
  })

  it('calls register with the entered credentials once validation passes', async () => {
    const user = userEvent.setup()
    const authValue = createMockAuthContext()
    renderWithProviders(<RegisterPage />, { authValue })

    await fillAndSubmit(user, {
      password: 'CorrectHorseBattery9!',
      confirmPassword: 'CorrectHorseBattery9!',
    })

    await waitFor(() => {
      expect(authValue.register).toHaveBeenCalledWith(
        'shopper@example.test',
        'CorrectHorseBattery9!',
      )
    })
  })

  it('shows the inline password requirements and updates them as the user types (UX-24)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RegisterPage />)

    const list = screen.getByRole('list', { name: 'Password requirements' })
    const state = () =>
      within(list)
        .getAllByRole('listitem')
        .map((li) => /— met$/.test(li.textContent ?? ''))

    // Untouched: nothing satisfied yet.
    expect(state()).toEqual([false, false, false])

    // The password field points at the requirements list for screen readers.
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining(list.id),
    )

    await user.type(screen.getByLabelText('Password'), '12345678')
    expect(state()).toEqual([true, false, false]) // long enough, but only-numbers

    await user.type(screen.getByLabelText('Password'), 'x')
    expect(state()).toEqual([true, true, true]) // '12345678x' — all good
  })

  it('reveals the password on both password fields without breaking submit (UX-23)', async () => {
    const user = userEvent.setup()
    const authValue = createMockAuthContext()
    renderWithProviders(<RegisterPage />, { authValue })

    const password = screen.getByLabelText('Password')
    const confirm = screen.getByLabelText('Confirm password')
    await user.type(screen.getByLabelText('Email'), 'shopper@example.test')
    await user.type(password, 'CorrectHorseBattery9')
    await user.type(confirm, 'CorrectHorseBattery9')

    const [showPassword, showConfirm] = screen.getAllByRole('button', { name: 'Show password' })
    await user.click(showPassword)
    await user.click(showConfirm)
    expect(password).toHaveAttribute('type', 'text')
    expect(confirm).toHaveAttribute('type', 'text')
    expect(authValue.register).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() =>
      expect(authValue.register).toHaveBeenCalledWith(
        'shopper@example.test',
        'CorrectHorseBattery9',
      ),
    )
  })

  it('returns to the pre-auth destination after registering, not always home (UX-04)', async () => {
    const user = userEvent.setup()
    const authValue = createMockAuthContext()
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <AuthContext.Provider value={authValue}>
          <MemoryRouter
            initialEntries={[
              { pathname: '/register', state: { from: { pathname: '/checkout', search: '' } } },
            ]}
          >
            <ToastProvider>
              <Routes>
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/checkout" element={<div>Checkout page</div>} />
                <Route path="/" element={<div>Home page</div>} />
              </Routes>
            </ToastProvider>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )

    await fillAndSubmit(user, {
      password: 'CorrectHorseBattery9!',
      confirmPassword: 'CorrectHorseBattery9!',
    })

    expect(await screen.findByText('Checkout page')).toBeInTheDocument()
    expect(screen.queryByText('Home page')).not.toBeInTheDocument()
  })
})
