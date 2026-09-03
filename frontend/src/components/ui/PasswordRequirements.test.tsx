import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PasswordRequirements } from './PasswordRequirements'
import { PASSWORD_REQUIREMENTS } from '@/schemas/auth.schema'

function statesFor(value: string) {
  render(<PasswordRequirements value={value} />)
  const list = screen.getByRole('list', { name: 'Password requirements' })
  return Object.fromEntries(
    within(list)
      .getAllByRole('listitem')
      .map((li) => {
        const label = li.textContent?.replace(/ — (met|not met)$/, '').trim() ?? ''
        const met = /— met$/.test(li.textContent ?? '')
        return [label, met]
      }),
  )
}

describe('PasswordRequirements (UX-24)', () => {
  it('lists exactly the rules the auth schema enforces — nothing invented', () => {
    render(<PasswordRequirements value="" />)
    const items = within(
      screen.getByRole('list', { name: 'Password requirements' }),
    ).getAllByRole('listitem')
    expect(items).toHaveLength(PASSWORD_REQUIREMENTS.length)
    expect(items.map((i) => i.textContent?.replace(/ — not met$/, '').trim())).toEqual([
      'At least 8 characters',
      'Not only numbers',
      'Not a commonly used password',
    ])
  })

  it('shows every requirement as "not met" for an empty value', () => {
    expect(statesFor('')).toEqual({
      'At least 8 characters': false,
      'Not only numbers': false,
      'Not a commonly used password': false,
    })
  })

  it('marks only the length rule met for a short non-numeric value', () => {
    expect(statesFor('abc')).toEqual({
      'At least 8 characters': false,
      'Not only numbers': true,
      'Not a commonly used password': true,
    })
  })

  it('marks "Not only numbers" unmet for a purely numeric 8+ char value', () => {
    expect(statesFor('12345678')).toEqual({
      'At least 8 characters': true,
      'Not only numbers': false,
      'Not a commonly used password': false, // 12345678 is on the blocklist
    })
  })

  it('marks "Not a commonly used password" unmet for a blocklisted password', () => {
    expect(statesFor('abc12345')).toEqual({
      'At least 8 characters': true,
      'Not only numbers': true,
      'Not a commonly used password': false,
    })
  })

  it('marks every requirement met for a strong password', () => {
    expect(statesFor('CorrectHorseBattery9')).toEqual({
      'At least 8 characters': true,
      'Not only numbers': true,
      'Not a commonly used password': true,
    })
  })

  it('exposes each item state in text, not colour alone', () => {
    render(<PasswordRequirements value="CorrectHorseBattery9" />)
    const list = screen.getByRole('list', { name: 'Password requirements' })
    within(list)
      .getAllByRole('listitem')
      .forEach((li) => expect(li.textContent).toMatch(/ — met$/))
  })

  it('wires an id through for aria-describedby', () => {
    render(<PasswordRequirements id="pw-reqs" value="" />)
    expect(screen.getByRole('list', { name: 'Password requirements' })).toHaveAttribute(
      'id',
      'pw-reqs',
    )
  })
})
