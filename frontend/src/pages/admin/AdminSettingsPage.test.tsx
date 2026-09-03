import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { AdminSettingsPage } from './AdminSettingsPage'

const SETTINGS_RESPONSE = {
  success: true,
  data: [
    {
      key: 'storeName',
      label: 'Store name',
      description: 'The name customers see for this store. This is the STORE name, not the "PrintForge" platform name. Required.',
      kind: 'text',
      value: 'PrintForge',
      default: 'PrintForge',
    },
    {
      key: 'storeAdminName',
      label: 'Store admin name',
      description: 'Display name for the store owner / administrator. Optional.',
      kind: 'text',
      value: '',
      default: '',
    },
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
      value: 'Free shipping this week',
      default: '',
    },
    {
      key: 'tax.enabled',
      label: 'GST / tax enabled',
      description: 'When off, every order records tax = ₹0.00.',
      kind: 'boolean',
      value: 'false',
      default: 'false',
    },
    {
      key: 'tax.pricingMode',
      label: 'Tax pricing mode',
      description: 'INCLUSIVE per the blueprint. EXCLUSIVE is locked pending client confirmation.',
      kind: 'enum',
      value: 'INCLUSIVE',
      default: 'INCLUSIVE',
      options: ['INCLUSIVE'],
    },
    {
      key: 'tax.ratePercent',
      label: 'Combined GST rate (%)',
      description: 'PENDING CLIENT CONFIRMATION — do not set a guessed value.',
      kind: 'percent',
      value: '',
      default: '0.00',
      pendingClientInput: true,
    },
    {
      key: 'invoice.numberPrefix',
      label: 'Invoice number prefix',
      description: 'Prepended to the invoice sequence.',
      kind: 'text',
      value: 'INV-',
      default: 'INV-',
      pendingClientInput: true,
    },
    {
      key: 'invoice.sellerGstin',
      label: 'Seller GSTIN (on invoice)',
      description: 'The business GST identification number.',
      kind: 'text',
      value: '',
      default: '',
      pendingClientInput: true,
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

  // ─── Preserved behaviour ───────────────────────────────────────────────

  it('renders a form per configurable setting', async () => {
    renderWithProviders(<AdminSettingsPage />)

    expect(await screen.findByLabelText('Flat shipping fee (₹)')).toBeInTheDocument()
    expect(screen.getByLabelText('Announcement bar text')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(SETTINGS_RESPONSE.data.length)
  })

  it('disables Save until the value is changed', async () => {
    renderWithProviders(<AdminSettingsPage />)

    await screen.findByLabelText('Flat shipping fee (₹)')
    screen.getAllByRole('button', { name: 'Save' }).forEach((b) => expect(b).toBeDisabled())
  })

  it('shows an inline validation error and does not call the API for a negative fee', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AdminSettingsPage />)

    const field = await screen.findByLabelText('Flat shipping fee (₹)')
    await user.clear(field)
    await user.type(field, '-5')
    await user.click(within(field.closest('form') as HTMLElement).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/non-negative amount/i)).toBeInTheDocument()
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
    const form = field.closest('form') as HTMLElement
    await user.clear(field)
    await user.type(field, '49')

    expect(screen.queryByText(/saved/i)).not.toBeInTheDocument()

    await user.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({ value: '49' })
    expect(await within(form).findByText(/the value is now .49\.00./i)).toBeInTheDocument()
  })

  it('surfaces a server validation error without claiming success', async () => {
    const user = userEvent.setup()
    mock.onPatch('/admin/settings/shippingFeeFlat').reply(400, {
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Shipping fee cannot be negative', details: [] },
    })

    renderWithProviders(<AdminSettingsPage />)

    const field = await screen.findByLabelText('Flat shipping fee (₹)')
    const form = field.closest('form') as HTMLElement
    await user.clear(field)
    await user.type(field, '5')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    expect(await within(form).findByText('Shipping fee cannot be negative')).toBeInTheDocument()
    expect(within(form).queryByText(/^Saved\./i)).not.toBeInTheDocument()
  })

  // ─── Redesign structure ────────────────────────────────────────────────

  it('renders exactly one h1 with a title and description', async () => {
    renderWithProviders(<AdminSettingsPage />)

    await screen.findByLabelText('Flat shipping fee (₹)')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Store settings')
    expect(screen.getByText(/take effect immediately across the storefront and checkout/i)).toBeInTheDocument()
  })

  it('groups settings into Store identity / Storefront / Tax (GST) / Invoicing cards', async () => {
    renderWithProviders(<AdminSettingsPage />)

    await screen.findByLabelText('Flat shipping fee (₹)')

    const identity = screen.getByRole('region', { name: 'Store identity' })
    expect(within(identity).getByLabelText('Store name')).toBeInTheDocument()
    expect(within(identity).getByLabelText('Store admin name')).toBeInTheDocument()

    const storefront = screen.getByRole('region', { name: 'Storefront' })
    expect(within(storefront).getByLabelText('Flat shipping fee (₹)')).toBeInTheDocument()
    expect(within(storefront).getByLabelText('Announcement bar text')).toBeInTheDocument()
    // Store identity fields are NOT duplicated into Storefront.
    expect(within(storefront).queryByLabelText('Store name')).not.toBeInTheDocument()

    const tax = screen.getByRole('region', { name: 'Tax (GST)' })
    expect(within(tax).getByLabelText('GST / tax enabled')).toBeInTheDocument()
    expect(within(tax).getByLabelText('Tax pricing mode')).toBeInTheDocument()

    const invoicing = screen.getByRole('region', { name: 'Invoicing' })
    expect(within(invoicing).getByLabelText('Invoice number prefix')).toBeInTheDocument()
  })

  it('populates each field with the current backend value', async () => {
    renderWithProviders(<AdminSettingsPage />)

    expect(await screen.findByLabelText('Announcement bar text')).toHaveValue('Free shipping this week')
    expect(screen.getByLabelText('Invoice number prefix')).toHaveValue('INV-')
    expect(screen.getByLabelText('Tax pricing mode')).toHaveValue('INCLUSIVE')
  })

  it('renders the boolean setting as a select with true / false options', async () => {
    renderWithProviders(<AdminSettingsPage />)

    const select = await screen.findByLabelText('GST / tax enabled')
    expect(select.tagName).toBe('SELECT')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['false', 'true'])
  })

  it('offers only the API-provided option for tax pricing mode (EXCLUSIVE stays locked)', async () => {
    renderWithProviders(<AdminSettingsPage />)

    const select = await screen.findByLabelText('Tax pricing mode')
    expect(within(select).getAllByRole('option')).toHaveLength(1)
    expect(within(select).getByRole('option', { name: 'INCLUSIVE' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'EXCLUSIVE' })).not.toBeInTheDocument()
  })

  it('flags a pending-client-input setting with an informational notice', async () => {
    renderWithProviders(<AdminSettingsPage />)

    const field = await screen.findByLabelText('Combined GST rate (%)')
    const form = field.closest('form') as HTMLElement
    expect(within(form).getByText(/leave blank until the client\/accountant/i)).toBeInTheDocument()
    expect(field).toHaveValue('')
  })

  it('saves a choice setting, sending the exact { value } payload', async () => {
    const user = userEvent.setup()
    mock.onPatch('/admin/settings/tax.enabled').reply(200, {
      success: true,
      data: { ...SETTINGS_RESPONSE.data[2], value: 'true' },
    })

    renderWithProviders(<AdminSettingsPage />)

    const select = await screen.findByLabelText('GST / tax enabled')
    const form = select.closest('form') as HTMLElement
    await user.selectOptions(select, 'true')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(mock.history.patch[0].url).toBe('/admin/settings/tax.enabled')
    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({ value: 'true' })
    expect(await within(form).findByText(/the value is now .true./i)).toBeInTheDocument()
  })

  // ─── States ────────────────────────────────────────────────────────────

  it('shows a page-level skeleton (polite loading status) while loading', () => {
    mock.onGet('/admin/settings').reply(() => new Promise(() => {}))
    renderWithProviders(<AdminSettingsPage />)

    expect(screen.getByText('Loading').closest('[role="status"]')).toBeInTheDocument()
    expect(screen.queryByLabelText('Flat shipping fee (₹)')).not.toBeInTheDocument()
  })

  it('surfaces a settings fetch error through the shared Alert', async () => {
    mock.onGet('/admin/settings').reply(500, {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Settings unavailable', details: [] },
    })
    renderWithProviders(<AdminSettingsPage />)

    expect(await screen.findByText('Settings unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Store settings')
  })

  // ─── Store identity (Store Name / Store Admin Name) ────────────────────

  it('loads the current store name and store admin name from the API', async () => {
    mock.onGet('/admin/settings').reply(200, {
      success: true,
      data: SETTINGS_RESPONSE.data.map((s) =>
        s.key === 'storeName'
          ? { ...s, value: 'Atharva Prints' }
          : s.key === 'storeAdminName'
            ? { ...s, value: 'Atharva Vavhal' }
            : s,
      ),
    })
    renderWithProviders(<AdminSettingsPage />)

    expect(await screen.findByLabelText('Store name')).toHaveValue('Atharva Prints')
    expect(screen.getByLabelText('Store admin name')).toHaveValue('Atharva Vavhal')
  })

  it('edits and saves the store name, showing a real "Saved" confirmation', async () => {
    const user = userEvent.setup()
    mock.onPatch('/admin/settings/storeName').reply(200, {
      success: true,
      data: { ...SETTINGS_RESPONSE.data[0], value: 'Atharva Prints' },
    })
    renderWithProviders(<AdminSettingsPage />)

    const field = await screen.findByLabelText('Store name')
    const form = field.closest('form') as HTMLElement
    await user.clear(field)
    await user.type(field, 'Atharva Prints')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(mock.history.patch[0].url).toBe('/admin/settings/storeName')
    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({ value: 'Atharva Prints' })
    expect(await within(form).findByText(/the value is now .Atharva Prints./i)).toBeInTheDocument()
  })

  it('blocks an empty store name client-side and never calls the API', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AdminSettingsPage />)

    const field = await screen.findByLabelText('Store name')
    const form = field.closest('form') as HTMLElement
    await user.clear(field)
    await user.type(field, '  ')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    expect(await within(form).findByText(/store name is required/i)).toBeInTheDocument()
    expect(mock.history.patch).toHaveLength(0)
  })

  it('surfaces a server rejection of the store name without claiming success', async () => {
    const user = userEvent.setup()
    mock.onPatch('/admin/settings/storeName').reply(400, {
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Store name cannot exceed 60 characters', details: [] },
    })
    renderWithProviders(<AdminSettingsPage />)

    const field = await screen.findByLabelText('Store name')
    const form = field.closest('form') as HTMLElement
    await user.clear(field)
    await user.type(field, 'A slightly different name')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    expect(
      await within(form).findByText('Store name cannot exceed 60 characters'),
    ).toBeInTheDocument()
    expect(within(form).queryByText(/^Saved\./i)).not.toBeInTheDocument()
  })

  it('allows an empty store admin name (optional)', async () => {
    const user = userEvent.setup()
    mock.onPatch('/admin/settings/storeAdminName').reply(200, {
      success: true,
      data: { ...SETTINGS_RESPONSE.data[1], value: 'Atharva Vavhal' },
    })
    renderWithProviders(<AdminSettingsPage />)

    const field = await screen.findByLabelText('Store admin name')
    const form = field.closest('form') as HTMLElement
    await user.type(field, 'Atharva Vavhal')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(mock.history.patch[0].url).toBe('/admin/settings/storeAdminName')
  })

  // ─── Negative assertions ───────────────────────────────────────────────

  it('renders only the settings the API returns — no add/remove, no unsupported fields, no analytics', async () => {
    renderWithProviders(<AdminSettingsPage />)

    await screen.findByLabelText('Flat shipping fee (₹)')
    // No way to add or delete a setting.
    expect(screen.queryByRole('button', { name: /add setting|new setting|delete/i })).not.toBeInTheDocument()
    // No invented tax/legal fields beyond what the API returned.
    expect(screen.queryByLabelText('Seller PAN')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('CGST rate')).not.toBeInTheDocument()
    expect(screen.queryByText(/^\{/)).not.toBeInTheDocument()
    expect(screen.queryByRole('figure')).not.toBeInTheDocument()
    expect(document.querySelector('canvas')).toBeNull()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })
})
