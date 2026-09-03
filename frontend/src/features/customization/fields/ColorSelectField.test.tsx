import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomizationField } from '@/types/catalog'
import { ColorSelectField } from './ColorSelectField'

/** A realistic controlled host — the real callers (CustomizationForm via
 * RHF Controller) feed the new value straight back as the `value` prop. */
function ControlledColorSelectField({
  initialValue = '',
  onChange,
}: {
  initialValue?: string
  onChange?: (value: string) => void
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <ColorSelectField
      field={field}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
    />
  )
}

const field = {
  id: 'f-color',
  label: 'Colour',
  fieldType: 'SELECT',
  isRequired: true,
  helpText: null,
  constraints: { options: ['White', 'Black', 'Sunset Gradient'] },
} as unknown as CustomizationField

describe('ColorSelectField', () => {
  it('renders each option as a radio with its label as the accessible name', () => {
    render(<ColorSelectField field={field} value="" onChange={vi.fn()} />)
    expect(screen.getByRole('radiogroup', { name: 'Colour' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'White' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Black' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Sunset Gradient' })).toBeInTheDocument()
  })

  it('shows a colour swatch for a recognised name and none for an unrecognised one', () => {
    render(<ColorSelectField field={field} value="" onChange={vi.fn()} />)

    const whiteLabel = screen.getByRole('radio', { name: 'White' }).closest('label')
    const swatch = whiteLabel?.querySelector('span[aria-hidden="true"]')
    expect(swatch).not.toBeNull()
    expect(swatch?.getAttribute('style')).toMatch(/background/)

    const customLabel = screen.getByRole('radio', { name: 'Sunset Gradient' }).closest('label')
    expect(customLabel?.querySelector('span[aria-hidden="true"]')).toBeNull()
  })

  it('marks the selected option as checked and leaves the others unchecked', () => {
    render(<ColorSelectField field={field} value="Black" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'Black' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'White' })).not.toBeChecked()
  })

  it('groups every option as a native radio under one shared name', () => {
    render(<ColorSelectField field={field} value="" onChange={vi.fn()} />)

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    for (const radio of radios) {
      expect(radio.tagName).toBe('INPUT')
      expect(radio).toHaveAttribute('type', 'radio')
      expect(radio).toHaveAttribute('name', 'f-color')
    }
  })

  it('emits the option label (not an index or hex) on selection', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ColorSelectField field={field} value="" onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: 'White' }))
    expect(onChange).toHaveBeenCalledWith('White')
  })

  it('supports native radio keyboard interaction — Tab in, Arrow to move + select (UX-15)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ControlledColorSelectField initialValue="Black" onChange={onChange} />)

    // Tab reaches the group once and lands on the checked option.
    await user.tab()
    expect(screen.getByRole('radio', { name: 'Black' })).toHaveFocus()

    // ArrowDown moves to the next option and selects it (selection follows focus).
    await user.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith('Sunset Gradient')
    expect(screen.getByRole('radio', { name: 'Sunset Gradient' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Sunset Gradient' })).toBeChecked()

    // ArrowUp goes back to the previous option.
    await user.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenLastCalledWith('Black')
    expect(screen.getByRole('radio', { name: 'Black' })).toBeChecked()
  })

  it('keeps mouse selection working after the native conversion (UX-15)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ControlledColorSelectField onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: 'Sunset Gradient' }))
    expect(onChange).toHaveBeenLastCalledWith('Sunset Gradient')
    expect(screen.getByRole('radio', { name: 'Sunset Gradient' })).toBeChecked()
  })
})
