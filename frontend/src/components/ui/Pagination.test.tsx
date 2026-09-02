import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from './Pagination'

describe('Pagination', () => {
  let scrollToSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when there is a single page (or none)', () => {
    const { container: one } = render(
      <Pagination page={1} totalPages={1} onPageChange={vi.fn()} />,
    )
    expect(one).toBeEmptyDOMElement()

    const { container: zero } = render(
      <Pagination page={1} totalPages={0} onPageChange={vi.fn()} />,
    )
    expect(zero).toBeEmptyDOMElement()
  })

  it('labels the nav landmark and shows the current position', () => {
    render(
      <Pagination page={2} totalPages={5} onPageChange={vi.fn()} label="Products pagination" />,
    )
    expect(screen.getByRole('navigation', { name: 'Products pagination' })).toBeInTheDocument()
    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument()
  })

  it('disables Previous on the first page and Next on the last', () => {
    const { rerender } = render(
      <Pagination page={1} totalPages={3} onPageChange={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()

    rerender(<Pagination page={3} totalPages={3} onPageChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('emits the next/previous one-based page number', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<Pagination page={2} totalPages={5} onPageChange={onPageChange} />)

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPageChange).toHaveBeenLastCalledWith(3)

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(onPageChange).toHaveBeenLastCalledWith(1)
  })

  it('scrolls the window to the top on a page change by default (UX-37)', async () => {
    const user = userEvent.setup()
    render(<Pagination page={2} totalPages={5} onPageChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0 })
  })

  it('does not scroll when scrollToTop is false', async () => {
    const user = userEvent.setup()
    render(<Pagination page={2} totalPages={5} onPageChange={vi.fn()} scrollToTop={false} />)

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('scrolls a provided target into view instead of the window', async () => {
    const user = userEvent.setup()
    const ref = createRef<HTMLDivElement>()
    const scrollIntoView = vi.fn()

    function Harness() {
      return (
        <>
          <div ref={ref} />
          <Pagination page={2} totalPages={5} onPageChange={vi.fn()} scrollTargetRef={ref} />
        </>
      )
    }
    render(<Harness />)
    if (ref.current) ref.current.scrollIntoView = scrollIntoView

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    expect(scrollToSpy).not.toHaveBeenCalled()
  })
})
