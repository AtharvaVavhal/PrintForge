import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminSelect } from './AdminSelect'

afterEach(cleanup)

describe('AdminSelect', () => {
  it('associates its visible label with the select', () => {
    render(
      <AdminSelect label="Status" name="status">
        <option value="">Any</option>
        <option value="active">Active</option>
      </AdminSelect>,
    )
    expect(screen.getByLabelText('Status')).toBe(screen.getByRole('combobox'))
  })

  it('keeps the label accessible when hidden visually', () => {
    render(
      <AdminSelect label="Filter by status" name="status" hideLabel>
        <option value="">Any</option>
      </AdminSelect>,
    )
    // Still reachable by its accessible name.
    expect(screen.getByRole('combobox', { name: 'Filter by status' })).toBeInTheDocument()
    // Hidden via the shared global utility, kept alongside the base label class.
    const label = screen.getByText('Filter by status')
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveClass('srOnly')
  })

  it('does not hide the label by default', () => {
    render(
      <AdminSelect label="Status" name="status">
        <option value="">Any</option>
      </AdminSelect>,
    )
    expect(screen.getByText('Status')).not.toHaveClass('srOnly')
  })

  it('surfaces an error with aria-invalid and role="alert"', () => {
    render(
      <AdminSelect label="Status" name="status" error="Required">
        <option value="">Any</option>
      </AdminSelect>,
    )
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Required')
  })

  it('is keyboard operable and reports changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <AdminSelect label="Status" name="status" onChange={onChange}>
        <option value="">Any</option>
        <option value="active">Active</option>
      </AdminSelect>,
    )
    await user.selectOptions(screen.getByRole('combobox'), 'active')
    expect(onChange).toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toHaveValue('active')
  })
})
