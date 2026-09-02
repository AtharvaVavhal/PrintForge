import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Alert } from './Alert'

describe('Alert', () => {
  it('announces an error assertively (role="alert")', () => {
    render(<Alert variant="error">Payment failed</Alert>)
    expect(screen.getByRole('alert')).toHaveTextContent('Payment failed')
  })

  it('announces info politely (role="status")', () => {
    render(<Alert variant="info">Prefilled from your saved address</Alert>)
    expect(screen.getByRole('status')).toHaveTextContent('Prefilled from your saved address')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('announces success politely (role="status")', () => {
    render(<Alert variant="success">Review submitted</Alert>)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lets a caller override the role explicitly', () => {
    render(
      <Alert variant="error" role="status">
        Non-urgent note
      </Alert>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('defaults to the polite status role', () => {
    render(<Alert>Heads up</Alert>)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
