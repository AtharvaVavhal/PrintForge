import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route, useLocation } from 'react-router-dom'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { ActiveFilterChips } from './ActiveFilterChips'

const CATEGORY_TREE = {
  success: true,
  data: [{ id: 'cat-1', name: 'Mugs', slug: 'mugs', children: [] }],
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="loc">{location.search}</output>
}

function renderChips(initialSearch: string) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/products"
        element={
          <>
            <ActiveFilterChips />
            <LocationProbe />
          </>
        }
      />
    </Routes>,
    { initialEntries: [`/products${initialSearch}`] },
  )
}

describe('ActiveFilterChips', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    mock.onGet('/categories/tree').reply(200, CATEGORY_TREE)
  })

  afterEach(() => {
    mock.restore()
  })

  it('renders nothing when no filters are applied', () => {
    renderChips('')
    expect(screen.queryByText('Filters:')).not.toBeInTheDocument()
  })

  it('shows a chip per active filter, resolving the category name from the tree', async () => {
    renderChips('?categoryId=cat-1&minRating=4&minPrice=100&maxPrice=500&search=mug')

    expect(await screen.findByRole('button', { name: /Mugs/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /4\+ stars/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /₹100\.00 – ₹500\.00/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /“mug”/ })).toBeInTheDocument()
  })

  it('removes only that filter from the URL when a chip is dismissed', async () => {
    const user = userEvent.setup()
    renderChips('?categoryId=cat-1&minRating=4&page=3')

    await user.click(await screen.findByRole('button', { name: /4\+ stars/ }))

    await waitFor(() => {
      const search = screen.getByTestId('loc').textContent ?? ''
      expect(search).toContain('categoryId=cat-1')
      expect(search).not.toContain('minRating')
      expect(search).not.toContain('page') // pagination resets on filter change
    })
  })

  it('offers "Clear all" only when more than one filter is active', async () => {
    const { unmount } = renderChips('?minRating=4')
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
    unmount()

    renderChips('?minRating=4&minPrice=100')
    expect(await screen.findByRole('button', { name: 'Clear all' })).toBeInTheDocument()
  })
})
