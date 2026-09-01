import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { AdminSettingsPage } from './AdminSettingsPage'

const SETTINGS_RESPONSE = {
  success: true,
  data: [
    {
      key: 'shippingFeeFlat',
      label: 'Flat shipping fee (₹)',
      description: 'Charged once per order at checkout.',
      kind: 'money',
      value: '0.00',
      default: '0.00',
    },
    {
      key: 'announcement_text',
      label: 'Announcement bar text',
      description: 'Leave blank to hide the bar.',
      kind: 'text',
      value: '',
      default: '',
    },
  ],
}

describe('AdminSettingsPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    mock.onGet('/admin/settings').reply(200, SETTINGS_RESPONSE)
  })

  afterEach(() => {
    mock.restore()
  })

  it('renders a form per configurable setting', async () => {
    renderWithProviders(<AdminSettingsPage />)

    expect(await screen.findByLabelText('Flat shipping fee (₹)')).toBeInTheDocument()
    expect(screen.getByLabelText('Announcement bar text')).toBeInTheDocument()
  })

  it('disables Save until the value is changed', async () => {
    renderWithProviders(<AdminSettingsPage />)

    await screen.findByLabelText('Flat shipping fee (₹)')
    const saveButtons = screen.getAllByRole('button', { name: 'Save' })
    saveButtons.forEach((b) => expect(b).toBeDisabled())
  })

  it('shows an inline validation error and does not call the API for a negative fee', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AdminSettingsPage />)

    const field = await screen.findByLabelText('Flat shipping fee (₹)')
    await user.clear(field)
    await user.type(field, '-5')
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])

    expect(
      await screen.findByText(/non-negative amount/i),
    ).toBeInTheDocument()
    expect(mock.history.patch).toHaveLength(0)
  })

  it('PATCHes a valid fee and only then shows a real "Saved" confirmation', async () => {
    const user = userEvent.setup()
    mock.onPatch('/admin/settings/shippingFeeFlat').reply(200, {
      success: true,
      data: { ...SETTINGS_RESPONSE.data[0], value: '49.00' },
    })

    renderWithProviders(<AdminSettingsPage />)

    const field = await screen.findByLabelText('Flat shipping fee (₹)')
    await user.clear(field)
    await user.type(field, '49')

    // No premature success text.
    expect(screen.queryByText(/saved/i)).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    const body = JSON.parse(mock.history.patch[0].data as string) as { value: string }
    expect(body).toEqual({ value: '49' })
    expect(await screen.findByText(/shipping fee is now ₹49\.00/i)).toBeInTheDocument()
  })

  it('surfaces a server validation error without claiming success', async () => {
    const user = userEvent.setup()
    mock.onPatch('/admin/settings/shippingFeeFlat').reply(400, {
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Shipping fee cannot be negative', details: [] },
    })

    renderWithProviders(<AdminSettingsPage />)

    const field = await screen.findByLabelText('Flat shipping fee (₹)')
    await user.clear(field)
    await user.type(field, '5')
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])

    expect(await screen.findByText('Shipping fee cannot be negative')).toBeInTheDocument()
    expect(screen.queryByText(/^Saved\./i)).not.toBeInTheDocument()
  })
})
