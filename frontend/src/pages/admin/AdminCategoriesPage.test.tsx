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

  it('lists categories and never renders a delete control — no DELETE /categories/:id endpoint exists', async () => {
    mock.onGet('/categories').reply(200, { success: true, data: [buildCategory()] })

    renderWithProviders(<AdminCategoriesPage />)

    expect(await screen.findByText('Drinkware')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('creates a new category, sending only the fields the DTO accepts', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories').reply(200, { success: true, data: [buildCategory()] })
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
    // The mutation's own onSuccess also invalidates ['categories'], which
    // triggers a background refetch — mocked separately so it reflects the
    // just-saved state, same as the real backend would (see AccountPage's
    // equivalent test for the same pattern).
    mock.onGet('/categories').replyOnce(200, { success: true, data: [buildCategory()] })
    mock.onPatch('/categories/cat-1').reply(200, {
      success: true,
      data: buildCategory({ name: 'Drinkware & Mugs' }),
    })
    mock.onGet('/categories').reply(200, { success: true, data: [buildCategory({ name: 'Drinkware & Mugs' })] })

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
