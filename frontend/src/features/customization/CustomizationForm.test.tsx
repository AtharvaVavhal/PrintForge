import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { renderWithProviders } from '@/test/test-utils'
import { apiClient } from '@/services/api/client'
import type { CustomizationField } from '@/types/catalog'
import { CustomizationForm, type CustomizationFormState } from './CustomizationForm'

function buildField(overrides: Partial<CustomizationField>): CustomizationField {
  return {
    id: overrides.id ?? 'field',
    productId: 'prod-1',
    label: 'Field',
    type: 'TEXT',
    isRequired: false,
    sortOrder: 0,
    helpText: null,
    constraints: null,
    surchargeType: 'NONE',
    surchargeAmount: '0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// Mirrors the real Photo Collage Mug fields (prisma/seed-production.ts):
// a required LOGO_UPLOAD, a required COLOR_SELECT, and an optional TEXT
// field with a per-character surcharge.
const LOGO_FIELD = buildField({
  id: 'logo',
  label: 'Logo',
  type: 'LOGO_UPLOAD',
  isRequired: true,
  constraints: { allowedFormats: ['png', 'jpeg'], maxFileSizeMb: 5 },
})
const COLOR_FIELD = buildField({
  id: 'color',
  label: 'Mug Color',
  type: 'COLOR_SELECT',
  isRequired: true,
  constraints: { options: ['White', 'Black', 'Red'] },
})
const CAPTION_FIELD = buildField({
  id: 'caption',
  label: 'Caption',
  type: 'TEXT',
  isRequired: false,
  constraints: { maxLength: 40 },
  surchargeType: 'PER_CHARACTER',
  surchargeAmount: '1',
})

describe('CustomizationForm', () => {
  let apiMock: MockAdapter

  beforeEach(() => {
    apiMock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    apiMock.restore()
  })

  it('marks required customization fields (text / colour / file) and not optional ones (UX-46)', () => {
    renderWithProviders(<CustomizationForm fields={[LOGO_FIELD, COLOR_FIELD, CAPTION_FIELD]} />)

    // File upload keeps the "*" inside its <label> (aria-hidden), so TL's
    // label lookup includes it; the semantic is on the input.
    expect(screen.getByLabelText('Logo *', { selector: 'input' })).toHaveAttribute(
      'aria-required',
      'true',
    )
    expect(screen.getByRole('radiogroup', { name: 'Mug Color' })).toHaveAttribute(
      'aria-required',
      'true',
    )
    // CAPTION_FIELD is isRequired:false — plain label, no aria-required.
    expect(screen.getByLabelText('Caption')).not.toHaveAttribute('aria-required')
    // Two required fields → two visual "*" markers.
    expect(screen.getAllByText('*')).toHaveLength(2)
  })

  it('shows a required-field error after a required text field is touched and left blank', async () => {
    const user = userEvent.setup()
    const requiredText = buildField({ id: 'slogan', label: 'Slogan', isRequired: true })
    renderWithProviders(<CustomizationForm fields={[requiredText]} />)

    // The label is the plain field name; the required "*" (UX-46) is a
    // sibling of <label>, and the input carries aria-required.
    const input = screen.getByLabelText('Slogan')
    expect(input).toHaveAttribute('aria-required', 'true')
    await user.type(input, 'a')
    await user.clear(input)

    expect(await screen.findByText('Slogan is required')).toBeInTheDocument()
  })

  it('shows the running per-character surcharge as the customer types', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CustomizationForm fields={[CAPTION_FIELD]} />)

    await user.type(screen.getByLabelText('Caption'), 'Hi!')

    expect(await screen.findByText('₹3.00 so far', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Customization total:')).toBeInTheDocument()
  })

  it('rejects a COLOR_SELECT value outside constraints.options and accepts a valid one', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<CustomizationForm fields={[COLOR_FIELD]} onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: 'White' }))

    await waitFor(() => {
      const lastCall = onChange.mock.calls.at(-1)?.[0] as CustomizationFormState
      expect(lastCall.values).toEqual([{ fieldId: 'color', textValue: 'White' }])
      expect(lastCall.isValid).toBe(true)
    })
  })

  it('uploads the selected file on change and reports the resulting uploadedFileId', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    apiMock.onPost('/uploads').reply(201, {
      success: true,
      data: {
        id: 'uploaded-file-id-1',
        url: 'https://res.cloudinary.com/demo/image/upload/logo.png',
        format: 'png',
        bytes: 1024,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })

    renderWithProviders(<CustomizationForm fields={[LOGO_FIELD]} onChange={onChange} />)

    const file = new File(['fake-image-bytes'], 'logo.png', { type: 'image/png' })
    const input = screen.getByLabelText('Logo *', { selector: 'input' })
    await user.upload(input, file)

    // UX-22: the selected-file card (filename + local thumbnail) appears
    // immediately, without changing what gets submitted.
    expect(await screen.findByText('logo.png')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Preview of logo.png' })).toBeInTheDocument()

    await waitFor(() => {
      const lastCall = onChange.mock.calls.at(-1)?.[0] as CustomizationFormState
      expect(lastCall.values).toEqual([{ fieldId: 'logo', uploadedFileId: 'uploaded-file-id-1' }])
      expect(lastCall.isValid).toBe(true)
    })
  })

  it('rejects an oversized file against constraints.maxFileSizeMb without calling the API', async () => {
    // Deliberately correctly-typed (matches accept=".png,.jpeg") — a
    // mismatched extension can't be used to exercise this path at all,
    // since @testing-library/user-event's upload() respects the input's
    // `accept` attribute the same way a real OS file picker would and
    // silently refuses to select a non-matching file (event.target.files
    // stays empty, handleFileChange never runs). File size isn't
    // filtered by `accept`, so this is the one local-rejection rule that
    // can actually be driven through a real upload() interaction.
    const user = userEvent.setup()
    renderWithProviders(<CustomizationForm fields={[LOGO_FIELD]} />)

    const oversizedFile = new File([new Uint8Array(6 * 1024 * 1024)], 'huge-logo.png', {
      type: 'image/png',
    })
    const input = screen.getByLabelText('Logo *', { selector: 'input' })
    await user.upload(input, oversizedFile)

    expect(await screen.findByText('Logo must be at most 5MB')).toBeInTheDocument()
    expect(apiMock.history.post.length).toBe(0)
  })
})
