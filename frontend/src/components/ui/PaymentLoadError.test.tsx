import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PaymentLoadError } from '@/components/ui/PaymentLoadError'

describe('PaymentLoadError', () => {
  it('renders error message and retry button', () => {
    const onRetry = vi.fn()
    render(<PaymentLoadError message="Custom error" onRetry={onRetry} />)

    expect(screen.getByText('Payment service unavailable')).toBeInTheDocument()
    expect(screen.getByText('Custom error')).toBeInTheDocument()
    expect(screen.getByText('Try disabling ad-blockers or tracking protection for this site, then click Retry.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry loading payment service/i })).toBeInTheDocument()
  })

  it('calls onRetry when button clicked', () => {
    const onRetry = vi.fn()
    render(<PaymentLoadError onRetry={onRetry} />)

    fireEvent.click(screen.getByRole('button', { name: /retry loading payment service/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders without message when not provided', () => {
    render(<PaymentLoadError />)
    expect(screen.getByText('Unable to load the payment window. This may be due to network issues, browser extensions, or security settings.')).toBeInTheDocument()
  })
})