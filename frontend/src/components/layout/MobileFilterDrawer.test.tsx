import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { MobileFilterDrawer } from './MobileFilterDrawer'

const CATEGORY_TREE = {
  success: true,
  data: [{ id: 'cat-1', name: 'Mugs', slug: 'mugs', children: [] }],
}

describe('MobileFilterDrawer', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    mock.onGet('/categories/tree').reply(200, CATEGORY_TREE)
  })
  afterEach(() => {
    mock.restore()
  })

  it('stays open when a filter is changed and only closes on an explicit action (UX-11)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    renderWithProviders(
      <MobileFilterDrawer
        isOpen
        onClose={onClose}
        hasActiveFilters={false}
        onClearAll={vi.fn()}
      />,
      { initialEntries: ['/products'] },
    )

    // Changing a filter (a category) must NOT close the drawer.
    await user.click(await screen.findByRole('button', { name: 'Mugs' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // "Show results" is the deliberate close action.
    await user.click(screen.getByRole('button', { name: 'Show results' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on the X button and on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    renderWithProviders(
      <MobileFilterDrawer
        isOpen
        onClose={onClose}
        hasActiveFilters={false}
        onClearAll={vi.fn()}
      />,
      { initialEntries: ['/products'] },
    )

    await user.click(await screen.findByRole('button', { name: 'Close filters' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2))
  })

  it('renders nothing while closed', () => {
    const { container } = renderWithProviders(
      <MobileFilterDrawer
        isOpen={false}
        onClose={vi.fn()}
        hasActiveFilters={false}
        onClearAll={vi.fn()}
      />,
      { initialEntries: ['/products'] },
    )
    expect(container).toBeEmptyDOMElement()
  })
})
