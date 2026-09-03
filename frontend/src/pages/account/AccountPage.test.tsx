import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders, createMockAuthContext } from '@/test/test-utils'
import { AccountPage } from './AccountPage'

const AUTH_VALUE = createMockAuthContext({
  status: 'authenticated',
  user: { id: 'user-1', email: 'shopper@example.test', role: 'CUSTOMER', createdAt: '2026-01-01T00:00:00.000Z' },
})

function buildProfile(overrides: Partial<Record<string, string | null>> = {}) {
  return {
    id: 'user-1',
    email: 'shopper@example.test',
    addressLine1: '221B Baker St',
    addressLine2: null,
    city: 'Mumbai',
    state: 'MH',
    postalCode: '400001',
    country: 'India',
    phone: '9876543210',
    role: 'CUSTOMER',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('AccountPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  it('renders the current profile values read-only, with email never inside the edit form', async () => {
    mock.onGet('/users/me').reply(200, { success: true, data: buildProfile() })

    renderWithProviders(<AccountPage />, { authValue: AUTH_VALUE })

    expect(await screen.findByText('shopper@example.test')).toBeInTheDocument()
    expect(screen.getByText(/221B Baker St.*Mumbai.*MH.*400001.*India/)).toBeInTheDocument()
    expect(screen.getByText('9876543210')).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Edit profile' }))

    // Email is displayed nowhere as an editable input — no field to find it in.
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument()
  })

  it('links to the orders page and offers a sign-out action', async () => {
    mock.onGet('/users/me').reply(200, { success: true, data: buildProfile() })

    renderWithProviders(<AccountPage />, { authValue: AUTH_VALUE })

    await screen.findByText('shopper@example.test')
    expect(screen.getByRole('link', { name: /your orders/i })).toHaveAttribute('href', '/orders')
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
  })

  it('shows "No address on file yet" and "Not provided" when the profile has no address/phone', async () => {
    mock.onGet('/users/me').reply(
      200,
      {
        success: true,
        data: buildProfile({
          addressLine1: null,
          city: null,
          state: null,
          postalCode: null,
          country: null,
          phone: null,
        }),
      },
    )

    renderWithProviders(<AccountPage />, { authValue: AUTH_VALUE })

    expect(await screen.findByText('No address on file yet.')).toBeInTheDocument()
    expect(screen.getByText('Not provided')).toBeInTheDocument()
  })

  it('pre-fills the edit form with the currently loaded values', async () => {
    const user = userEvent.setup()
    mock.onGet('/users/me').reply(200, { success: true, data: buildProfile() })

    renderWithProviders(<AccountPage />, { authValue: AUTH_VALUE })

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }))

    expect(screen.getByLabelText('Address line 1')).toHaveValue('221B Baker St')
    expect(screen.getByLabelText('City')).toHaveValue('Mumbai')
    expect(screen.getByLabelText('Postal code')).toHaveValue('400001')
    expect(screen.getByLabelText('Phone')).toHaveValue('9876543210')
    expect(screen.getByLabelText('Address line 2')).toHaveValue('')

    // Every profile field is optional per accountSchema — none is marked
    // required (UX-46).
    for (const label of ['Address line 1', 'Address line 2', 'City', 'State', 'Postal code', 'Country', 'Phone']) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-required')
    }
    expect(screen.queryByText('*')).not.toBeInTheDocument()
  })

  it('validates field length before submit and never fires the PATCH', async () => {
    const user = userEvent.setup()
    mock.onGet('/users/me').reply(200, { success: true, data: buildProfile() })
    mock.onPatch('/users/me').reply(200, { success: true, data: buildProfile() })

    renderWithProviders(<AccountPage />, { authValue: AUTH_VALUE })

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }))

    const cityField = screen.getByLabelText('City')
    await user.clear(cityField)
    await user.type(cityField, 'a'.repeat(101))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Must be 100 characters or fewer')).toBeInTheDocument()
    expect(mock.history.patch.length).toBe(0)
  })

  it('PATCHes only the changed field, converting a blank input to null rather than ""', async () => {
    const user = userEvent.setup()
    mock.onGet('/users/me').reply(200, { success: true, data: buildProfile() })
    mock.onPatch('/users/me').reply(200, {
      success: true,
      data: buildProfile({ city: 'Delhi', phone: null }),
    })

    renderWithProviders(<AccountPage />, { authValue: AUTH_VALUE })

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }))

    const cityField = screen.getByLabelText('City')
    await user.clear(cityField)
    await user.type(cityField, 'Delhi')

    const phoneField = screen.getByLabelText('Phone')
    await user.clear(phoneField)

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mock.history.patch.length).toBe(1))
    const body = JSON.parse(mock.history.patch[0].data as string) as Record<string, unknown>
    expect(body).toEqual({ city: 'Delhi', phone: null })
  })

  it('does not fire a PATCH at all when the form is submitted with no changes', async () => {
    const user = userEvent.setup()
    mock.onGet('/users/me').reply(200, { success: true, data: buildProfile() })

    renderWithProviders(<AccountPage />, { authValue: AUTH_VALUE })

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument())
    expect(mock.history.patch.length).toBe(0)
  })

  it('on success, returns to the view showing the saved values and a success message', async () => {
    const user = userEvent.setup()
    // The mutation's own onSuccess also invalidates ['users', 'me'], which
    // triggers a background refetch — the initial GET and that refetch are
    // mocked separately so the refetch reflects the just-saved state, same
    // as the real backend would.
    mock.onGet('/users/me').replyOnce(200, { success: true, data: buildProfile() })
    mock.onPatch('/users/me').reply(200, {
      success: true,
      data: buildProfile({ city: 'Delhi' }),
    })
    mock.onGet('/users/me').reply(200, { success: true, data: buildProfile({ city: 'Delhi' }) })

    renderWithProviders(<AccountPage />, { authValue: AUTH_VALUE })

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }))
    const cityField = screen.getByLabelText('City')
    await user.clear(cityField)
    await user.type(cityField, 'Delhi')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Profile updated')).toBeInTheDocument()
    expect(screen.getByText(/Delhi/)).toBeInTheDocument()
    expect(screen.queryByLabelText('City')).not.toBeInTheDocument()
  })

  it('on a failed save, stays in edit mode with the typed values intact and shows the error', async () => {
    const user = userEvent.setup()
    mock.onGet('/users/me').reply(200, { success: true, data: buildProfile() })
    mock.onPatch('/users/me').reply(400, {
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Could not save your profile.', details: [] },
    })

    renderWithProviders(<AccountPage />, { authValue: AUTH_VALUE })

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }))
    const cityField = screen.getByLabelText('City')
    await user.clear(cityField)
    await user.type(cityField, 'Kolkata')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Could not save your profile.')).toBeInTheDocument()
    // Still in edit mode, and the in-progress edit wasn't reverted.
    expect(screen.getByLabelText('City')).toHaveValue('Kolkata')
  })
})
