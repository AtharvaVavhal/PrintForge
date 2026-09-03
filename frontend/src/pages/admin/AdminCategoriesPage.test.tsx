import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
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

function adminList(items: unknown[]) {
  return { success: true, data: items }
}

function conflictBody(message: string) {
  return { success: false, error: { code: 'CONFLICT', message, details: [] } }
}

function lastBody(entries: { data?: unknown }[]) {
  return JSON.parse(entries[entries.length - 1].data as string) as Record<string, unknown>
}

describe('AdminCategoriesPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  // A
  it('lists every category (active + inactive) via GET /categories/admin', async () => {
    mock.onGet('/categories/admin').reply(
      200,
      adminList([
        buildCategory(),
        buildCategory({ id: 'cat-2', name: 'Retired', slug: 'retired', isActive: false }),
      ]),
    )

    renderWithProviders(<AdminCategoriesPage />)

    expect(await screen.findByText('Drinkware')).toBeInTheDocument()
    expect(screen.getByText('Retired')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Active')).toBeInTheDocument()
    expect(within(table).getByText('Inactive')).toBeInTheDocument()
  })

  // B
  it('confirms in a modal before deactivating, and only DELETEs on confirm', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').replyOnce(200, adminList([buildCategory()]))
    mock
      .onDelete('/categories/cat-1')
      .reply(200, { success: true, data: { message: 'Category deactivated' } })
    mock.onGet('/categories/admin').reply(200, adminList([buildCategory({ isActive: false })]))

    renderWithProviders(<AdminCategoriesPage />)

    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))

    const dialog = screen.getByRole('dialog', { name: 'Deactivate category' })
    expect(mock.history.delete).toHaveLength(0)

    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => expect(mock.history.delete).toHaveLength(1))
    expect(await screen.findByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })

  it('can cancel the deactivate confirmation without calling DELETE', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').reply(200, adminList([buildCategory()]))

    renderWithProviders(<AdminCategoriesPage />)

    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))
    const dialog = screen.getByRole('dialog', { name: 'Deactivate category' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mock.history.delete).toHaveLength(0)
  })

  it('mentions the number of child categories in the deactivate confirmation', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').reply(
      200,
      adminList([
        buildCategory({ id: 'parent', name: 'Parent', slug: 'parent' }),
        buildCategory({ id: 'child', name: 'Child', slug: 'child', parentCategoryId: 'parent' }),
      ]),
    )

    renderWithProviders(<AdminCategoriesPage />)

    await screen.findByText('Parent', { selector: '[data-depth]' })
    const parentRow = screen
      .getByText('Parent', { selector: '[data-depth]' })
      .closest('tr') as HTMLElement
    await user.click(within(parentRow).getByRole('button', { name: 'Deactivate' }))

    const dialog = screen.getByRole('dialog', { name: 'Deactivate category' })
    expect(within(dialog).getByText(/1 child category will remain under it/)).toBeInTheDocument()
  })

  // C
  it('reactivates an inactive category immediately via POST /categories/:id/reactivate', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').replyOnce(200, adminList([buildCategory({ isActive: false })]))
    mock
      .onPost('/categories/cat-1/reactivate')
      .reply(200, { success: true, data: { message: 'Category reactivated' } })
    mock.onGet('/categories/admin').reply(200, adminList([buildCategory()]))

    renderWithProviders(<AdminCategoriesPage />)

    await user.click(await screen.findByRole('button', { name: 'Reactivate' }))

    await waitFor(() => expect(mock.history.post).toHaveLength(1))
    expect(await screen.findByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
  })

  // D
  it('creates a category with no parent, sending exactly { name, slug }', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').reply(200, adminList([buildCategory()]))
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

    await waitFor(() => expect(mock.history.post).toHaveLength(1))
    expect(lastBody(mock.history.post)).toEqual({ name: 'Apparel', slug: 'apparel' })
  })

  // E
  it('creates a category with a selected parent, sending parentCategoryId', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').reply(200, adminList([buildCategory()]))
    mock.onPost('/categories').reply(201, { success: true, data: buildCategory({ id: 'cat-2' }) })

    renderWithProviders(<AdminCategoriesPage />)

    await screen.findByText('Drinkware')
    await user.click(screen.getByRole('button', { name: 'New category' }))
    await user.type(screen.getByLabelText('Name'), 'Mugs')
    await user.type(screen.getByLabelText('Slug'), 'mugs')
    await user.selectOptions(screen.getByLabelText('Parent category'), 'cat-1')
    await user.click(screen.getByRole('button', { name: 'Create category' }))

    await waitFor(() => expect(mock.history.post).toHaveLength(1))
    expect(lastBody(mock.history.post)).toMatchObject({
      name: 'Mugs',
      slug: 'mugs',
      parentCategoryId: 'cat-1',
    })
  })

  // F
  it('edits an existing category via PATCH', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').replyOnce(200, adminList([buildCategory()]))
    mock.onPatch('/categories/cat-1').reply(200, {
      success: true,
      data: buildCategory({ name: 'Drinkware & Mugs' }),
    })
    mock.onGet('/categories/admin').reply(200, adminList([buildCategory({ name: 'Drinkware & Mugs' })]))

    renderWithProviders(<AdminCategoriesPage />)

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const nameField = screen.getByLabelText('Name')
    await user.clear(nameField)
    await user.type(nameField, 'Drinkware & Mugs')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(await screen.findByText('Drinkware & Mugs')).toBeInTheDocument()
  })

  // G
  it('reparents a category via PATCH with the new parentCategoryId', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').reply(
      200,
      adminList([
        buildCategory({ id: 'cat-1', name: 'Alpha', slug: 'alpha' }),
        buildCategory({ id: 'cat-2', name: 'Beta', slug: 'beta' }),
      ]),
    )
    mock.onPatch('/categories/cat-2').reply(200, { success: true, data: buildCategory({ id: 'cat-2' }) })

    renderWithProviders(<AdminCategoriesPage />)

    await screen.findByText('Beta')
    const betaRow = screen.getByText('Beta').closest('tr') as HTMLElement
    await user.click(within(betaRow).getByRole('button', { name: 'Edit' }))
    await user.selectOptions(screen.getByLabelText('Parent category'), 'cat-1')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(lastBody(mock.history.patch)).toMatchObject({ parentCategoryId: 'cat-1' })
  })

  // H
  it('moves a nested category back to the top level, sending parentCategoryId: null', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').reply(
      200,
      adminList([
        buildCategory({ id: 'cat-1', name: 'Alpha', slug: 'alpha' }),
        buildCategory({ id: 'cat-2', name: 'Beta', slug: 'beta', parentCategoryId: 'cat-1' }),
      ]),
    )
    mock.onPatch('/categories/cat-2').reply(200, { success: true, data: buildCategory({ id: 'cat-2' }) })

    renderWithProviders(<AdminCategoriesPage />)

    await screen.findByText('Beta')
    const betaRow = screen.getByText('Beta').closest('tr') as HTMLElement
    await user.click(within(betaRow).getByRole('button', { name: 'Edit' }))
    await user.selectOptions(screen.getByLabelText('Parent category'), '')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(lastBody(mock.history.patch)).toEqual({
      name: 'Beta',
      slug: 'beta',
      parentCategoryId: null,
    })
  })

  // I
  it('excludes the edited category and its descendants from the parent options', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').reply(
      200,
      adminList([
        buildCategory({ id: 'cat-1', name: 'Alpha', slug: 'alpha' }),
        buildCategory({ id: 'cat-2', name: 'Beta', slug: 'beta', parentCategoryId: 'cat-1' }),
        buildCategory({ id: 'cat-3', name: 'Gamma', slug: 'gamma' }),
      ]),
    )

    renderWithProviders(<AdminCategoriesPage />)

    await screen.findByText('Alpha', { selector: '[data-depth]' })
    const alphaRow = screen
      .getByText('Alpha', { selector: '[data-depth]' })
      .closest('tr') as HTMLElement
    await user.click(within(alphaRow).getByRole('button', { name: 'Edit' }))

    const select = screen.getByLabelText('Parent category')
    const optionText = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent ?? '')
    expect(optionText.some((t) => t.includes('Alpha'))).toBe(false)
    expect(optionText.some((t) => t.includes('Beta'))).toBe(false)
    expect(optionText.some((t) => t.includes('Gamma'))).toBe(true)
    expect(optionText.some((t) => t.trim() === 'None')).toBe(true)
  })

  // J
  it('renders exactly one h1 titled "Categories"', async () => {
    mock.onGet('/categories/admin').reply(200, adminList([buildCategory()]))

    renderWithProviders(<AdminCategoriesPage />)

    await screen.findByText('Drinkware')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Categories')
  })

  // K
  it('renders a semantic table with the expected column headers', async () => {
    mock.onGet('/categories/admin').reply(200, adminList([buildCategory()]))

    renderWithProviders(<AdminCategoriesPage />)

    const table = await screen.findByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Name', 'Slug', 'Parent', 'Status', 'Actions'])
  })

  // L
  it('shows status as a badge with a visible text label', async () => {
    mock
      .onGet('/categories/admin')
      .reply(200, adminList([buildCategory({ isActive: false })]))

    renderWithProviders(<AdminCategoriesPage />)

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Inactive')).toBeInTheDocument()
  })

  // M
  it('shows a child category with its parent name and one indentation level', async () => {
    mock.onGet('/categories/admin').reply(
      200,
      adminList([
        buildCategory({ id: 'cat-1', name: 'Alpha', slug: 'alpha' }),
        buildCategory({ id: 'cat-2', name: 'Beta', slug: 'beta', parentCategoryId: 'cat-1' }),
      ]),
    )

    renderWithProviders(<AdminCategoriesPage />)

    const beta = await screen.findByText('Beta')
    expect(beta).toHaveAttribute('data-depth', '1')
    const betaRow = beta.closest('tr') as HTMLElement
    expect(within(betaRow).getByText('Alpha')).toBeInTheDocument()
  })

  // N
  it('orders roots alphabetically with each child immediately below its parent', async () => {
    mock.onGet('/categories/admin').reply(
      200,
      adminList([
        buildCategory({ id: 'cat-3', name: 'Gamma', slug: 'gamma' }),
        buildCategory({ id: 'cat-2', name: 'Beta', slug: 'beta', parentCategoryId: 'cat-1' }),
        buildCategory({ id: 'cat-1', name: 'Alpha', slug: 'alpha' }),
      ]),
    )

    renderWithProviders(<AdminCategoriesPage />)

    await screen.findByText('Alpha', { selector: '[data-depth]' })
    const bodyRows = screen.getAllByRole('row').slice(1)
    const names = bodyRows.map((r) => within(r).getAllByRole('cell')[0].textContent)
    expect(names).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  // O
  it('shows a page-level skeleton (polite loading status) while the first fetch is in flight', () => {
    mock.onGet('/categories/admin').reply(() => new Promise(() => {}))

    renderWithProviders(<AdminCategoriesPage />)

    expect(screen.getByText('Loading').closest('[role="status"]')).toBeInTheDocument()
  })

  // P
  it('surfaces a list fetch error through the shared Alert', async () => {
    mock.onGet('/categories/admin').reply(500)

    renderWithProviders(<AdminCategoriesPage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/something went wrong/i)
  })

  // Q
  it('surfaces a deactivate mutation error through an Alert', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').reply(200, adminList([buildCategory()]))
    mock.onDelete('/categories/cat-1').reply(500)

    renderWithProviders(<AdminCategoriesPage />)

    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }),
    )

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
  })

  // R
  it('shows the empty state (with a create action) when there are no categories', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').reply(200, adminList([]))

    renderWithProviders(<AdminCategoriesPage />)

    expect(await screen.findByText('No categories yet')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'New category' })[0])
    expect(screen.queryByText('No categories yet')).not.toBeInTheDocument()
  })

  // S
  it('has no search control', async () => {
    mock.onGet('/categories/admin').reply(200, adminList([buildCategory()]))

    renderWithProviders(<AdminCategoriesPage />)

    await screen.findByText('Drinkware')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  // T
  it('has no pagination navigation', async () => {
    mock.onGet('/categories/admin').reply(200, adminList([buildCategory()]))

    renderWithProviders(<AdminCategoriesPage />)

    await screen.findByText('Drinkware')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  // U
  it('shows a server slug-conflict error inside the form Alert', async () => {
    const user = userEvent.setup()
    mock.onGet('/categories/admin').reply(200, adminList([buildCategory()]))
    mock
      .onPost('/categories')
      .reply(409, conflictBody('A category with this slug already exists'))

    renderWithProviders(<AdminCategoriesPage />)

    await screen.findByText('Drinkware')
    await user.click(screen.getByRole('button', { name: 'New category' }))
    await user.type(screen.getByLabelText('Name'), 'Drinkware')
    await user.type(screen.getByLabelText('Slug'), 'drinkware')
    await user.click(screen.getByRole('button', { name: 'Create category' }))

    expect(
      await screen.findByText('A category with this slug already exists'),
    ).toBeInTheDocument()
  })
})
