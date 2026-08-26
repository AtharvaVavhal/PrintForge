import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockAuthContext, renderWithProviders } from '@/test/test-utils'
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
})
