import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TextField } from './TextField'

describe('TextField', () => {
  it('associates the label with the input and surfaces the error with role="alert"', () => {
    render(<TextField label="Email" name="email" error="Enter a valid email address" />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'email-error')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address')
  })

  describe('required indicator (UX-46)', () => {
    it('marks a required field with a visual "*" and aria-required, keeping the accessible name clean', () => {
      render(<TextField label="Recipient name" name="recipient" required />)
      const input = screen.getByLabelText('Recipient name')
      expect(input).toHaveAttribute('aria-required', 'true')
      // The label text itself is just the field name.
      expect(screen.getByText('Recipient name').tagName).toBe('LABEL')
      // The "*" is present but decorative (aria-hidden), not part of the name.
      const mark = screen.getByText('*')
      expect(mark).toHaveAttribute('aria-hidden', 'true')
    })

    it('does not add an indicator or aria-required for an optional field', () => {
      render(<TextField label="Address line 2" name="line2" />)
      const input = screen.getByLabelText('Address line 2')
      expect(input).not.toHaveAttribute('aria-required')
      expect(screen.queryByText('*')).not.toBeInTheDocument()
    })

    it('still wires the label, error and aria-describedby when required', () => {
      render(<TextField label="City" name="city" required error="City is required" />)
      const input = screen.getByLabelText('City')
      expect(input).toHaveAttribute('aria-required', 'true')
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input).toHaveAttribute('aria-describedby', 'city-error')
      expect(screen.getByRole('alert')).toHaveTextContent('City is required')
    })
  })

  it('merges a caller-supplied aria-describedby with the generated error id', () => {
    render(
      <TextField
        label="Password"
        name="password"
        aria-describedby="pw-help"
        error="Too short"
      />,
    )
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'aria-describedby',
      'pw-help password-error',
    )
  })

  describe('revealable password (UX-23)', () => {
    it('starts masked and toggles to text and back with an accessible button', async () => {
      const user = userEvent.setup()
      render(<TextField label="Password" name="password" type="password" revealable />)

      const input = screen.getByLabelText('Password')
      expect(input).toHaveAttribute('type', 'password')

      const toggle = screen.getByRole('button', { name: 'Show password' })
      expect(toggle).toHaveAttribute('type', 'button')

      await user.click(toggle)
      expect(input).toHaveAttribute('type', 'text')
      expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Hide password' }))
      expect(input).toHaveAttribute('type', 'password')
      expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
    })

    it('preserves the typed value across a toggle', async () => {
      const user = userEvent.setup()
      render(<TextField label="Password" name="password" type="password" revealable />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'hunter2secret')
      expect(input).toHaveValue('hunter2secret')

      await user.click(screen.getByRole('button', { name: 'Show password' }))
      expect(input).toHaveValue('hunter2secret')
      await user.click(screen.getByRole('button', { name: 'Hide password' }))
      expect(input).toHaveValue('hunter2secret')
    })

    it('does not submit the surrounding form when toggled', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
      render(
        <form onSubmit={onSubmit}>
          <TextField label="Password" name="password" type="password" revealable />
        </form>,
      )

      await user.click(screen.getByRole('button', { name: 'Show password' }))
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('is operable by keyboard (Tab to the toggle, Enter and Space activate it)', async () => {
      const user = userEvent.setup()
      render(<TextField label="Password" name="password" type="password" revealable />)

      const input = screen.getByLabelText('Password')
      input.focus()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus()

      await user.keyboard('{Enter}')
      expect(input).toHaveAttribute('type', 'text')

      await user.keyboard(' ')
      expect(input).toHaveAttribute('type', 'password')
    })

    it('renders no toggle when revealable is not set', () => {
      render(<TextField label="Password" name="password" type="password" />)
      expect(screen.queryByRole('button', { name: /password/i })).not.toBeInTheDocument()
      expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    })
  })
})
