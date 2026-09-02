import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminPagination } from './AdminPagination'

afterEach(cleanup)

describe('AdminPagination', () => {
  it('renders nothing when there is a single page (or fewer)', () => {
    const { container } = render(
      <AdminPagination page={1} totalPages={1} onPageChange={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a Pagination nav landmark with a live page indicator', () => {
    render(<AdminPagination page={2} totalPages={5} onPageChange={vi.fn()} />)
    const nav = screen.getByRole('navigation', { name: 'Pagination' })
    const indicator = screen.getByText('Page 2 of 5')
    expect(nav).toContainElement(indicator)
    expect(indicator).toHaveAttribute('aria-current', 'page')
  })

  it('disables Previous on the first page and Next on the last', () => {
    const { rerender } = render(
      <AdminPagination page={1} totalPages={3} onPageChange={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()

    rerender(<AdminPagination page={3} totalPages={3} onPageChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('calls onPageChange with the adjacent one-based page number', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<AdminPagination page={2} totalPages={4} onPageChange={onPageChange} />)

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPageChange).toHaveBeenLastCalledWith(3)

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(onPageChange).toHaveBeenLastCalledWith(1)
  })

  it('is keyboard operable', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<AdminPagination page={2} totalPages={4} onPageChange={onPageChange} />)

    await user.tab()
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onPageChange).toHaveBeenCalledWith(3)
  })
})
