import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProductVariant } from '@/types/catalog'
import { VariantSelector } from './VariantSelector'

/** Mirrors ProductDetailPage: the chosen id is fed straight back in. */
function ControlledVariantSelector({
  variants,
  initialSelectedId = null,
  onChange,
}: {
  variants: ProductVariant[]
  initialSelectedId?: string | null
  onChange?: (id: string) => void
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(initialSelectedId)
  return (
    <VariantSelector
      variants={variants}
      selectedVariantId={selectedVariantId}
      onChange={(id) => {
        setSelectedVariantId(id)
        onChange?.(id)
      }}
    />
  )
}

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

    expect(screen.getByRole('radio', { name: /Large/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Small/ })).not.toBeChecked()
  })

  it('groups every option under one radio-group name with the value as the submitted state', () => {
    render(
      <VariantSelector
        variants={[AVAILABLE, WITH_DELTA]}
        selectedVariantId="var-1"
        onChange={vi.fn()}
      />,
    )

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    for (const radio of radios) {
      expect(radio).toHaveAttribute('name', 'product-variant')
    }
    expect(radios[0]).toHaveAttribute('value', 'var-1')
  })

  it('supports native radio-group keyboard interaction (Tab in, Arrow to move + select)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ControlledVariantSelector
        variants={[AVAILABLE, WITH_DELTA]}
        initialSelectedId="var-1"
        onChange={onChange}
      />,
    )

    // Tab reaches the group once and lands on the checked option (roving tabindex).
    await user.tab()
    expect(screen.getByRole('radio', { name: /Small/ })).toHaveFocus()

    // ArrowDown moves to the next option AND selects it (selection follows focus).
    await user.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith('var-2')
    expect(screen.getByRole('radio', { name: /Large/ })).toHaveFocus()
    expect(screen.getByRole('radio', { name: /Large/ })).toBeChecked()

    // ArrowUp returns to the previous option.
    await user.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenLastCalledWith('var-1')
    expect(screen.getByRole('radio', { name: /Small/ })).toBeChecked()
  })

  it('skips a disabled option during arrow-key navigation', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ControlledVariantSelector
        variants={[AVAILABLE, UNAVAILABLE, WITH_DELTA]}
        initialSelectedId="var-1"
        onChange={onChange}
      />,
    )

    await user.tab()
    expect(screen.getByRole('radio', { name: /Small/ })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    // 'Discontinued' (disabled) is skipped — focus/selection land on 'Large'.
    expect(onChange).toHaveBeenLastCalledWith('var-2')
    expect(screen.getByRole('radio', { name: /Large/ })).toHaveFocus()
    expect(screen.getByRole('radio', { name: /Discontinued/ })).not.toBeChecked()
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
