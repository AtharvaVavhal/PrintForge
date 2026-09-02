import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from './ToastProvider'
import { useToast } from './useToast'

function Trigger({ options }: { options: Parameters<ReturnType<typeof useToast>['showToast']>[0] }) {
  const { showToast } = useToast()
  return (
    <button type="button" onClick={() => showToast(options)}>
      fire toast
    </button>
  )
}

function renderWithToast(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <ToastProvider>{node}</ToastProvider>
    </MemoryRouter>,
  )
}

describe('ToastProvider', () => {
  it('renders a message inside a polite live region', async () => {
    const user = userEvent.setup()
    renderWithToast(<Trigger options={{ message: 'Saved' }} />)

    await user.click(screen.getByRole('button', { name: 'fire toast' }))

    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveTextContent('Saved')
  })

  it('renders an action as an in-app link and dismisses the toast when it is followed', async () => {
    const user = userEvent.setup()
    renderWithToast(
      <Trigger options={{ message: 'Added to cart', action: { label: 'View cart', to: '/cart' } }} />,
    )

    await user.click(screen.getByRole('button', { name: 'fire toast' }))

    const link = screen.getByRole('link', { name: 'View cart' })
    expect(link).toHaveAttribute('href', '/cart')

    await user.click(link)
    expect(screen.queryByText('Added to cart')).not.toBeInTheDocument()
  })

  it('dismisses a toast when its close button is pressed', async () => {
    const user = userEvent.setup()
    renderWithToast(<Trigger options={{ message: 'Item removed' }} />)

    await user.click(screen.getByRole('button', { name: 'fire toast' }))
    expect(screen.getByText('Item removed')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByText('Item removed')).not.toBeInTheDocument()
  })

  it('auto-dismisses after the given duration', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderWithToast(<Trigger options={{ message: 'Temporary', duration: 50 }} />)

    await user.click(screen.getByRole('button', { name: 'fire toast' }))
    expect(screen.getByText('Temporary')).toBeInTheDocument()

    await act(() => new Promise((resolve) => setTimeout(resolve, 80)))
    expect(screen.queryByText('Temporary')).not.toBeInTheDocument()
  })

  it('keeps at most three toasts, dropping the oldest', async () => {
    const user = userEvent.setup()
    function MultiTrigger() {
      const { showToast } = useToast()
      return (
        <button
          type="button"
          onClick={() => {
            showToast({ message: 'one', duration: 0 })
            showToast({ message: 'two', duration: 0 })
            showToast({ message: 'three', duration: 0 })
            showToast({ message: 'four', duration: 0 })
          }}
        >
          fire four
        </button>
      )
    }
    renderWithToast(<MultiTrigger />)

    await user.click(screen.getByRole('button', { name: 'fire four' }))

    expect(screen.queryByText('one')).not.toBeInTheDocument()
    expect(screen.getByText('two')).toBeInTheDocument()
    expect(screen.getByText('three')).toBeInTheDocument()
    expect(screen.getByText('four')).toBeInTheDocument()
  })

  it('throws when useToast is used outside a provider', () => {
    function Bare() {
      useToast()
      return null
    }
    expect(() => render(<Bare />)).toThrow(/ToastProvider/)
  })
})
