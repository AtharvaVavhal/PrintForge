import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PriceBreakdown } from './PriceBreakdown'

describe('PriceBreakdown', () => {
  it('always shows subtotal and total, and nothing that is zero or absent', () => {
    render(<PriceBreakdown subtotal="300.00" total="300.00" />)

    expect(screen.getByText('Subtotal')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.queryByText('Shipping')).not.toBeInTheDocument()
    expect(screen.queryByText(/Discount/)).not.toBeInTheDocument()
    expect(screen.queryByText('GST')).not.toBeInTheDocument()
  })

  it('shows "Free" shipping when the fee is zero but provided', () => {
    render(<PriceBreakdown subtotal="300.00" shippingFee="0.00" total="300.00" />)
    expect(screen.getByText('Shipping')).toBeInTheDocument()
    expect(screen.getByText('Free')).toBeInTheDocument()
  })

  it('shows the discount with its coupon code, and the GST line only when tax applies', () => {
    render(
      <PriceBreakdown
        subtotal="300.00"
        shippingFee="49.00"
        discountAmount="30.00"
        couponCode="SAVE10"
        taxAmount="18.00"
        taxMode="INCLUSIVE"
        taxRatePercent="18.00"
        total="319.00"
      />,
    )

    expect(screen.getByText('₹49.00')).toBeInTheDocument()
    expect(screen.getByText('SAVE10')).toBeInTheDocument()
    expect(screen.getByText('−₹30.00')).toBeInTheDocument()
    expect(screen.getByText(/GST \(18\.00%\)/)).toBeInTheDocument()
    expect(screen.getByText('₹319.00')).toBeInTheDocument()
  })

  it('omits the GST row when the tax amount is zero (never a fabricated tax line)', () => {
    render(
      <PriceBreakdown subtotal="300.00" taxAmount="0.00" taxMode="INCLUSIVE" total="300.00" />,
    )
    expect(screen.queryByText(/GST/)).not.toBeInTheDocument()
  })
})
