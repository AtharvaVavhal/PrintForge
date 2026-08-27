import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuantityInput } from './QuantityInput'

/** A real-state wrapper for the typed-input tests — QuantityInput is a
 * controlled component, and typing keystroke-by-keystroke into a
 * controlled input whose value prop never actually updates (a bare
 * vi.fn() onChange) produces unreliable intermediate DOM values in jsdom.
 * Backing it with real state exercises the actual controlled-input
 * round-trip a real caller would see. */
function ControlledQuantityInput(props: {
  initialValue: number
  min?: number
  max?: number
}) {
  const [value, setValue] = useState(props.initialValue)
  return <QuantityInput value={value} onChange={setValue} min={props.min} max={props.max} />
}

describe('QuantityInput', () => {
  it('calls onChange with value + 1 when the increase button is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<QuantityInput value={2} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /increase/i }))

    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('calls onChange with value - 1 when the decrease button is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<QuantityInput value={2} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /decrease/i }))

    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('disables the decrease button at the minimum and never goes below it', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<QuantityInput value={5} onChange={onChange} min={5} />)

    const decreaseButton = screen.getByRole('button', { name: /decrease/i })
    expect(decreaseButton).toBeDisabled()

    await user.click(decreaseButton)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables the increase button at the maximum and never exceeds it', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<QuantityInput value={10} onChange={onChange} max={10} />)

    const increaseButton = screen.getByRole('button', { name: /increase/i })
    expect(increaseButton).toBeDisabled()

    await user.click(increaseButton)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps a typed value to the max bound', () => {
    render(<ControlledQuantityInput initialValue={1} min={1} max={10} />)

    const input = screen.getByRole('spinbutton')
    // fireEvent.change over user.type(): userEvent's clear()+type()
    // keystroke simulation on type="number" inputs is unreliable in jsdom
    // (clear() doesn't reliably empty them first) — this still exercises
    // the real onChange/clamp path, just via one direct value-set instead
    // of N simulated keystrokes.
    fireEvent.change(input, { target: { value: '999' } })

    expect(input).toHaveValue(10)
  })

  it('clamps a typed value to the min bound', () => {
    render(<ControlledQuantityInput initialValue={5} min={3} />)

    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '0' } })

    expect(input).toHaveValue(3)
  })

  it('has no upper bound when max is not provided', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<QuantityInput value={999} onChange={onChange} />)

    expect(screen.getByRole('button', { name: /increase/i })).not.toBeDisabled()

    await user.click(screen.getByRole('button', { name: /increase/i }))
    expect(onChange).toHaveBeenCalledWith(1000)
  })
})
