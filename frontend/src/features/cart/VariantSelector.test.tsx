import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProductVariant } from '@/types/catalog'
import { VariantSelector } from './VariantSelector'

function buildVariant(overrides: Partial<ProductVariant>): ProductVariant {
  return {
    id: 'var-1',
    productId: 'prod-1',
    label: 'Small',
    priceDelta: '0',
    isAvailable: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const AVAILABLE = buildVariant({ id: 'var-1', label: 'Small', priceDelta: '0' })
const WITH_DELTA = buildVariant({ id: 'var-2', label: 'Large', priceDelta: '25' })
const UNAVAILABLE = buildVariant({ id: 'var-3', label: 'Discontinued', isAvailable: false })

describe('VariantSelector', () => {
  it('renders every variant with its price delta', () => {
    render(
      <VariantSelector
        variants={[AVAILABLE, WITH_DELTA]}
        selectedVariantId={null}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Small')).toBeInTheDocument()
    expect(screen.getByText('Large')).toBeInTheDocument()
    expect(screen.getByText('+₹25.00')).toBeInTheDocument()
  })

  it('calls onChange with the variant id when an available option is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <VariantSelector variants={[AVAILABLE, WITH_DELTA]} selectedVariantId={null} onChange={onChange} />,
    )

    await user.click(screen.getByRole('radio', { name: /Large/ }))

    expect(onChange).toHaveBeenCalledWith('var-2')
  })

  it('marks the selected variant as checked', () => {
    render(
      <VariantSelector
        variants={[AVAILABLE, WITH_DELTA]}
        selectedVariantId="var-2"
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('radio', { name: /Large/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /Small/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('renders an unavailable variant as disabled and labeled, never hidden', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <VariantSelector variants={[AVAILABLE, UNAVAILABLE]} selectedVariantId={null} onChange={onChange} />,
    )

    const unavailableOption = screen.getByRole('radio', { name: /Discontinued/ })
    expect(unavailableOption).toBeDisabled()
    expect(screen.getByText('· Unavailable')).toBeInTheDocument()

    await user.click(unavailableOption)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows an error message when passed one', () => {
    render(
      <VariantSelector
        variants={[AVAILABLE]}
        selectedVariantId={null}
        onChange={vi.fn()}
        error="Please select an option above."
      />,
    )

    expect(screen.getByText('Please select an option above.')).toBeInTheDocument()
  })
})
