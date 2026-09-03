import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { ResetPasswordPage } from './ResetPasswordPage'

describe('ResetPasswordPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })
  afterEach(() => {
    mock.restore()
    vi.restoreAllMocks()
  })

  it('shows an error and no form when the reset link has no token', () => {
    renderWithProviders(<ResetPasswordPage />, { initialEntries: ['/reset-password'] })
    expect(screen.getByText(/invalid or missing its token/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })

  it('exposes the inline password requirements + a reveal toggle on the new-password field', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ResetPasswordPage />, {
      initialEntries: ['/reset-password?token=abc123'],
    })

    const newPassword = screen.getByLabelText('New password')
    expect(newPassword).toHaveAttribute('type', 'password')

    const list = screen.getByRole('list', { name: 'Password requirements' })
    expect(newPassword).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining(list.id),
    )

    await user.type(newPassword, 'CorrectHorseBattery9')
    within(list)
      .getAllByRole('listitem')
      .forEach((li) => expect(li.textContent).toMatch(/— met$/))

    await user.click(screen.getAllByRole('button', { name: 'Show password' })[0])
    expect(newPassword).toHaveAttribute('type', 'text')
    expect(newPassword).toHaveValue('CorrectHorseBattery9')
  })

  it('rejects a password that fails the existing policy before calling the API', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ResetPasswordPage />, {
      initialEntries: ['/reset-password?token=abc123'],
    })

    await user.type(screen.getByLabelText('New password'), 'password123')
    await user.type(screen.getByLabelText('Confirm new password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Reset password' }))

    expect(
      await screen.findByText('This password is too common — please choose another'),
    ).toBeInTheDocument()
    expect(mock.history.post).toHaveLength(0)
  })

  it('submits the new password with the token from the URL once valid', async () => {
    const user = userEvent.setup()
    mock.onPost('/auth/password-reset/confirm').reply(200, { success: true, data: null })
    renderWithProviders(<ResetPasswordPage />, {
      initialEntries: ['/reset-password?token=tok-42'],
    })

    await user.type(screen.getByLabelText('New password'), 'CorrectHorseBattery9')
    await user.type(screen.getByLabelText('Confirm new password'), 'CorrectHorseBattery9')
    await user.click(screen.getByRole('button', { name: 'Reset password' }))

    await waitFor(() => expect(mock.history.post).toHaveLength(1))
    expect(JSON.parse(mock.history.post[0].data as string)).toEqual({
      token: 'tok-42',
      newPassword: 'CorrectHorseBattery9',
    })
    expect(await screen.findByText(/password has been reset/i)).toBeInTheDocument()
  })
})
