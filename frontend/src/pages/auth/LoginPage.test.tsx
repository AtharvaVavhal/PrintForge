import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockAuthContext, renderWithProviders } from '@/test/test-utils'
import { LoginPage } from './LoginPage'

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
})
