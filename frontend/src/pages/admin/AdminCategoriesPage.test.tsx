import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { AdminCategoriesPage } from './AdminCategoriesPage'

function buildCategory(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cat-1',
    name: 'Drinkware',
    slug: 'drinkware',
    parentCategoryId: null,
    isActive: true,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  }
}

describe('AdminCategoriesPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  it('lists every category (active + inactive) via GET /categories/admin', async () => {
    mock.onGet('/categories/admin').reply(200, {
      success: true,
      data: [
        buildCategory(),
        buildCategory({ id: 'cat-2', name: 'Retired', slug: 'retired', isActive: false }),
      ],
    })

    renderWithProviders(<AdminCategoriesPage />)

    expect(await screen.findByText('Drinkware')).toBeInTheDocument()
    expect(screen.getByText('Retired')).toBeInTheDocument()
    // The inactive one is flagged.
    expect(screen.getByText(/· Inactive/)).toBeInTheDocument()
  })

  it('deactivates an active category via DELETE /categories/:id', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').replyOnce(200, { success: true, data: [buildCategory()] })
    mock.onDelete('/categories/cat-1').reply(200, { success: true, data: { message: 'Category deactivated' } })
    mock
      .onGet('/categories/admin')
      .reply(200, { success: true, data: [buildCategory({ isActive: false })] })

    renderWithProviders(<AdminCategoriesPage />)

    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(mock.history.delete.length).toBe(1))
    expect(await screen.findByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })

  it('reactivates an inactive category via POST /categories/:id/reactivate', async () => {
    const user = userEvent.setup()
    mock
      .onGet('/categories/admin')
      .replyOnce(200, { success: true, data: [buildCategory({ isActive: false })] })
    mock
      .onPost('/categories/cat-1/reactivate')
      .reply(200, { success: true, data: { message: 'Category reactivated' } })
    mock.onGet('/categories/admin').reply(200, { success: true, data: [buildCategory()] })

    renderWithProviders(<AdminCategoriesPage />)

    await user.click(await screen.findByRole('button', { name: 'Reactivate' }))

    await waitFor(() => expect(mock.history.post.length).toBe(1))
    expect(await screen.findByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
  })

  it('creates a new category, sending only the fields the DTO accepts', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').reply(200, { success: true, data: [buildCategory()] })
    mock.onPost('/categories').reply(201, {
      success: true,
      data: buildCategory({ id: 'cat-2', name: 'Apparel', slug: 'apparel' }),
    })

    renderWithProviders(<AdminCategoriesPage />)

    await screen.findByText('Drinkware')
    await user.click(screen.getByRole('button', { name: 'New category' }))
    await user.type(screen.getByLabelText('Name'), 'Apparel')
    await user.type(screen.getByLabelText('Slug'), 'apparel')
    await user.click(screen.getByRole('button', { name: 'Create category' }))

    await waitFor(() => expect(mock.history.post.length).toBe(1))
    const body = JSON.parse(mock.history.post[0].data as string) as Record<string, unknown>
    expect(body).toEqual({ name: 'Apparel', slug: 'apparel' })
  })

  it('edits an existing category via PATCH', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').replyOnce(200, { success: true, data: [buildCategory()] })
    mock.onPatch('/categories/cat-1').reply(200, {
      success: true,
      data: buildCategory({ name: 'Drinkware & Mugs' }),
    })
    mock
      .onGet('/categories/admin')
      .reply(200, { success: true, data: [buildCategory({ name: 'Drinkware & Mugs' })] })

    renderWithProviders(<AdminCategoriesPage />)

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const nameField = screen.getByLabelText('Name')
    await user.clear(nameField)
    await user.type(nameField, 'Drinkware & Mugs')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mock.history.patch.length).toBe(1))
    expect(await screen.findByText('Drinkware & Mugs')).toBeInTheDocument()
  })
})
