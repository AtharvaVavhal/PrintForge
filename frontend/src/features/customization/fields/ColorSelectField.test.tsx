import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomizationField } from '@/types/catalog'
import { ColorSelectField } from './ColorSelectField'

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

    const white = screen.getByRole('radio', { name: 'White' })
    const swatch = white.querySelector('span[aria-hidden="true"]')
    expect(swatch).not.toBeNull()
    expect(swatch?.getAttribute('style')).toMatch(/background/)

    const custom = screen.getByRole('radio', { name: 'Sunset Gradient' })
    expect(custom.querySelector('span[aria-hidden="true"]')).toBeNull()
  })

  it('marks the selected option with aria-checked', () => {
    render(<ColorSelectField field={field} value="Black" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'Black' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'White' })).not.toBeChecked()
  })

  it('emits the option label (not an index or hex) on selection', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ColorSelectField field={field} value="" onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: 'White' }))
    expect(onChange).toHaveBeenCalledWith('White')
  })
})
