import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShippingForm } from './ShippingForm'

describe('ShippingForm', () => {
  it('keeps the address fields editable while the payment script is loading (UX-05)', () => {
    render(<ShippingForm onSubmit={vi.fn()} isSubmitting={false} isScriptLoading />)

    expect(screen.getByLabelText('Recipient name')).toBeEnabled()
    expect(screen.getByLabelText('Address line 1')).toBeEnabled()
    expect(screen.getByLabelText('City')).toBeEnabled()
    // Only the final submit action is gated on script readiness.
    expect(screen.getByRole('button', { name: 'Loading payment…' })).toBeDisabled()
  })

  it('disables the fields only while the form is actually submitting', () => {
    render(<ShippingForm onSubmit={vi.fn()} isSubmitting />)

    expect(screen.getByLabelText('Recipient name')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled()
  })

  it('prefills from a saved address and stays fully editable (UX-07)', async () => {
    const user = userEvent.setup()
    render(
      <ShippingForm
        onSubmit={vi.fn()}
        isSubmitting={false}
        prefilled
        defaultValues={{
          shippingAddressLine1: '123 Baker St',
          shippingCity: 'Mumbai',
          shippingState: 'MH',
          shippingPostalCode: '400001',
          shippingCountry: 'India',
          shippingPhone: '9876543210',
        }}
      />,
    )

    expect(screen.getByText(/Prefilled from your saved address/)).toBeInTheDocument()
    expect(screen.getByLabelText('Address line 1')).toHaveValue('123 Baker St')
    expect(screen.getByLabelText('City')).toHaveValue('Mumbai')

    const city = screen.getByLabelText('City')
    await user.clear(city)
    await user.type(city, 'Pune')
    expect(city).toHaveValue('Pune')
  })

  it('submits the entered values', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ShippingForm onSubmit={onSubmit} isSubmitting={false} />)

    await user.type(screen.getByLabelText('Recipient name'), 'Jane Doe')
    await user.type(screen.getByLabelText('Phone number'), '9876543210')
    await user.type(screen.getByLabelText('Address line 1'), '123 Test St')
    await user.type(screen.getByLabelText('City'), 'Mumbai')
    await user.type(screen.getByLabelText('State'), 'MH')
    await user.type(screen.getByLabelText('Postal code'), '400001')
    await user.type(screen.getByLabelText('Country'), 'India')
    await user.click(screen.getByRole('button', { name: 'Pay now' }))

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        shippingRecipientName: 'Jane Doe',
        shippingCity: 'Mumbai',
        shippingCountry: 'India',
      }),
    )
  })
})
