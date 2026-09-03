import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { formatDate } from '@/utils/formatDate'
import { AdminCouponsPage } from './AdminCouponsPage'

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111'

const CATEGORIES_RESPONSE = {
  success: true,
  data: [{ id: CATEGORY_ID, name: 'Drinkware', slug: 'drinkware', parentCategoryId: null, isActive: true }],
}

function buildCoupon(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'coupon-1',
    code: 'SAVE10',
    type: 'PERCENTAGE',
    percentageOff: 10,
    flatAmountOff: null,
    scopeType: 'STORE_WIDE',
    categoryId: null,
    minOrderValue: null,
    usageLimitTotal: null,
    usageLimitPerUser: 1,
    usedCount: 0,
    firstOrderOnly: false,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    description: null,
    createdByAdminId: 'admin-1',
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  }
}

function listResponse(
  items: Record<string, unknown>[],
  meta: Partial<{ page: number; totalPages: number; total: number }> = {},
) {
  return {
    success: true,
    data: items,
    meta: { page: 1, limit: 20, total: items.length, totalPages: 1, ...meta },
  }
}

function couponCalls(mock: MockAdapter) {
  return mock.history.get.filter((r) => r.url === '/admin/coupons')
}

function lastParams(mock: MockAdapter) {
  return couponCalls(mock).at(-1)?.params as Record<string, unknown> | undefined
}

function bodyOf(entry: { data?: unknown }) {
  return JSON.parse(entry.data as string) as Record<string, unknown>
}

async function openNewCoupon(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: 'New coupon' })[0])
}

describe('AdminCouponsPage', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
    mock.onGet('/categories').reply(200, CATEGORIES_RESPONSE)
  })

  afterEach(() => {
    mock.restore()
  })

  // A
  it('lists coupons with a readable code, discount, scope and usage', async () => {
    mock.onGet('/admin/coupons').reply(
      200,
      listResponse([
        buildCoupon(),
        buildCoupon({
          id: 'coupon-2',
          code: 'CATSAVE',
          type: 'FLAT_AMOUNT',
          percentageOff: null,
          flatAmountOff: '50.00',
          scopeType: 'CATEGORY',
          categoryId: CATEGORY_ID,
          usageLimitTotal: 100,
          usedCount: 3,
        }),
      ]),
    )

    renderWithProviders(<AdminCouponsPage />)

    expect(await screen.findByText('SAVE10')).toBeInTheDocument()
    expect(screen.getByText('10% off')).toBeInTheDocument()
    expect(screen.getByText('Store-wide')).toBeInTheDocument()

    const catRow = screen.getByText('CATSAVE').closest('tr') as HTMLElement
    expect(within(catRow).getByText('₹50.00 off')).toBeInTheDocument()
    expect(within(catRow).getByText('Drinkware')).toBeInTheDocument()
    expect(within(catRow).getByText('3 / 100')).toBeInTheDocument()
    expect(within(catRow).getByText('1 per user')).toBeInTheDocument()
  })

  // AE / AF
  it('renders unlimited usage as "N / ∞" and never "?% off"', async () => {
    mock
      .onGet('/admin/coupons')
      .reply(200, listResponse([buildCoupon({ usedCount: 3, usageLimitTotal: null })]))

    renderWithProviders(<AdminCouponsPage />)

    expect(await screen.findByText('3 / ∞')).toBeInTheDocument()
    expect(screen.queryByText(/\?% off/)).not.toBeInTheDocument()
  })

  // AD
  it('marks a first-order-only coupon in the code cell', async () => {
    mock
      .onGet('/admin/coupons')
      .reply(200, listResponse([buildCoupon({ firstOrderOnly: true, description: 'Launch promo' })]))

    renderWithProviders(<AdminCouponsPage />)

    const row = (await screen.findByText('SAVE10')).closest('tr') as HTMLElement
    expect(within(row).getByText('First order only')).toBeInTheDocument()
    expect(within(row).getByText('Launch promo')).toBeInTheDocument()
  })

  // B
  it('creates a PERCENTAGE coupon: percentage field shown, flat hidden, correct body', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([]))
    mock.onPost('/admin/coupons').reply(201, { success: true, data: buildCoupon() })

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('No coupons yet')
    await openNewCoupon(user)

    expect(screen.getByLabelText('Percentage off (1-100)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Flat amount off')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Code'), 'save10')
    await user.type(screen.getByLabelText('Percentage off (1-100)'), '10')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    await waitFor(() => expect(mock.history.post).toHaveLength(1))
    expect(bodyOf(mock.history.post[0])).toEqual({
      code: 'save10',
      type: 'PERCENTAGE',
      percentageOff: 10,
      scopeType: 'STORE_WIDE',
      firstOrderOnly: false,
    })
  })

  // C
  it('creates a FLAT_AMOUNT coupon: flat field shown, percentage hidden, correct body', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([]))
    mock.onPost('/admin/coupons').reply(201, { success: true, data: buildCoupon({ type: 'FLAT_AMOUNT' }) })

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('No coupons yet')
    await openNewCoupon(user)

    await user.selectOptions(screen.getByLabelText('Type'), 'FLAT_AMOUNT')
    expect(screen.queryByLabelText('Percentage off (1-100)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Flat amount off')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Code'), 'FLAT50')
    await user.type(screen.getByLabelText('Flat amount off'), '50')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    await waitFor(() => expect(mock.history.post).toHaveLength(1))
    const body = bodyOf(mock.history.post[0])
    expect(body).toMatchObject({ type: 'FLAT_AMOUNT', flatAmountOff: 50 })
    expect(body.percentageOff).toBeUndefined()
  })

  // D
  it('creates a FREE_SHIPPING coupon: no discount value field, correct body', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([]))
    mock
      .onPost('/admin/coupons')
      .reply(201, { success: true, data: buildCoupon({ type: 'FREE_SHIPPING', percentageOff: null }) })

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('No coupons yet')
    await openNewCoupon(user)

    await user.selectOptions(screen.getByLabelText('Type'), 'FREE_SHIPPING')
    expect(screen.queryByLabelText('Percentage off (1-100)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Flat amount off')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Code'), 'FREESHIP')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    await waitFor(() => expect(mock.history.post).toHaveLength(1))
    const body = bodyOf(mock.history.post[0])
    expect(body).toEqual({
      code: 'FREESHIP',
      type: 'FREE_SHIPPING',
      scopeType: 'STORE_WIDE',
      firstOrderOnly: false,
    })
  })

  // E / AC
  it('requires a category for CATEGORY scope and sends categoryId once chosen', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([]))
    mock.onPost('/admin/coupons').reply(201, { success: true, data: buildCoupon({ scopeType: 'CATEGORY' }) })

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('No coupons yet')
    await openNewCoupon(user)

    await user.type(screen.getByLabelText('Code'), 'CATSAVE')
    await user.type(screen.getByLabelText('Percentage off (1-100)'), '15')
    await user.selectOptions(screen.getByLabelText('Scope'), 'CATEGORY')

    await user.click(screen.getByRole('button', { name: 'Create coupon' }))
    expect(await screen.findByText('Required for a category-scoped coupon')).toBeInTheDocument()
    expect(mock.history.post).toHaveLength(0)

    await user.selectOptions(screen.getByLabelText('Category'), CATEGORY_ID)
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    await waitFor(() => expect(mock.history.post).toHaveLength(1))
    expect(bodyOf(mock.history.post[0])).toMatchObject({
      scopeType: 'CATEGORY',
      categoryId: CATEGORY_ID,
    })
  })

  // F / AC
  it('requires percentageOff for a PERCENTAGE coupon before submitting', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([]))

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('No coupons yet')
    await openNewCoupon(user)

    await user.type(screen.getByLabelText('Code'), 'BADCODE')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    expect(await screen.findByText('Required for a percentage-off coupon')).toBeInTheDocument()
    expect(mock.history.post).toHaveLength(0)
  })

  // G
  it('never renders the immutable identity fields in the edit form', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([buildCoupon()]))

    renderWithProviders(<AdminCouponsPage />)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    const editForm = within(screen.getByRole('region', { name: 'Edit coupon' }))
    for (const label of [
      'Code',
      'Type',
      'Percentage off (1-100)',
      'Flat amount off',
      'Scope',
      'Category',
    ]) {
      expect(editForm.queryByLabelText(label)).not.toBeInTheDocument()
    }
    // sanity: the editable fields ARE there
    expect(editForm.getByLabelText('Total usage limit (optional)')).toBeInTheDocument()
  })

  // H
  it('edits limits and PATCHes the full editable field set', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').replyOnce(200, listResponse([buildCoupon()]))
    mock.onPatch('/admin/coupons/coupon-1').reply(200, {
      success: true,
      data: buildCoupon({ usageLimitTotal: 50 }),
    })
    mock.onGet('/admin/coupons').reply(200, listResponse([buildCoupon({ usageLimitTotal: 50 })]))

    renderWithProviders(<AdminCouponsPage />)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.type(screen.getByLabelText('Total usage limit (optional)'), '50')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(bodyOf(mock.history.patch[0])).toEqual({
      minOrderValue: null,
      usageLimitTotal: 50,
      usageLimitPerUser: 1,
      firstOrderOnly: false,
      startsAt: null,
      expiresAt: null,
      isActive: true,
      description: null,
    })
    expect(await screen.findByText('0 / 50')).toBeInTheDocument()
  })

  // I
  it('clears optional values by sending explicit null on edit', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').replyOnce(
      200,
      listResponse([
        buildCoupon({
          minOrderValue: '100.00',
          usageLimitTotal: 10,
          startsAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-12-31T00:00:00.000Z',
          description: 'Old promo',
        }),
      ]),
    )
    mock.onPatch('/admin/coupons/coupon-1').reply(200, { success: true, data: buildCoupon() })
    mock.onGet('/admin/coupons').reply(200, listResponse([buildCoupon()]))

    renderWithProviders(<AdminCouponsPage />)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    await user.clear(screen.getByLabelText('Minimum order value (optional)'))
    await user.clear(screen.getByLabelText('Total usage limit (optional)'))
    await user.clear(screen.getByLabelText('Starts at (optional)'))
    await user.clear(screen.getByLabelText('Expires at (optional)'))
    await user.clear(screen.getByLabelText('Description (optional, admin-internal)'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(bodyOf(mock.history.patch[0])).toMatchObject({
      minOrderValue: null,
      usageLimitTotal: null,
      startsAt: null,
      expiresAt: null,
      description: null,
    })
  })

  // J
  it('paginates with AdminPagination, preserving the active filter', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply((config) => {
      const p = (config.params as { page?: number }).page ?? 1
      return [200, listResponse([buildCoupon({ code: `PAGE${p}` })], { page: Number(p), totalPages: 2 })]
    })

    renderWithProviders(<AdminCouponsPage />, { initialEntries: ['/admin/coupons?status=active'] })
    await screen.findByText('PAGE1')

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('PAGE2')

    expect(lastParams(mock)).toMatchObject({ page: 2, isActive: true })
  })

  // K
  it('has a Status filter that sends isActive', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([buildCoupon()]))

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('SAVE10')

    await user.selectOptions(screen.getByLabelText('Status'), 'active')
    await waitFor(() => expect(lastParams(mock)).toMatchObject({ isActive: true }))

    await user.selectOptions(screen.getByLabelText('Status'), 'inactive')
    await waitFor(() => expect(lastParams(mock)).toMatchObject({ isActive: false }))

    await user.selectOptions(screen.getByLabelText('Status'), '')
    await waitFor(() => expect(lastParams(mock)?.isActive).toBeUndefined())
  })

  // L
  it('has a Type filter that sends the enum value', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([buildCoupon()]))

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('SAVE10')

    await user.selectOptions(screen.getByLabelText('Type'), 'FLAT_AMOUNT')
    await waitFor(() => expect(lastParams(mock)).toMatchObject({ type: 'FLAT_AMOUNT' }))
  })

  // M
  it('resets to page 1 when a filter changes', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([buildCoupon()], { totalPages: 5 }))

    renderWithProviders(<AdminCouponsPage />, { initialEntries: ['/admin/coupons?page=3'] })
    await screen.findByText('SAVE10')

    await user.selectOptions(screen.getByLabelText('Type'), 'PERCENTAGE')
    await waitFor(() => expect(lastParams(mock)).toMatchObject({ page: 1, type: 'PERCENTAGE' }))
  })

  // N
  it('renders every derived status as a labelled badge', async () => {
    mock.onGet('/admin/coupons').reply(
      200,
      listResponse([
        buildCoupon({ id: 'a', code: 'ACT' }),
        buildCoupon({ id: 'b', code: 'INACT', isActive: false }),
        buildCoupon({ id: 'c', code: 'EXP', expiresAt: '2000-01-01T00:00:00.000Z' }),
        buildCoupon({ id: 'd', code: 'SCHED', startsAt: '2099-01-01T00:00:00.000Z' }),
        buildCoupon({ id: 'e', code: 'FULL', usageLimitTotal: 5, usedCount: 5 }),
      ]),
    )

    renderWithProviders(<AdminCouponsPage />)
    const table = await screen.findByRole('table')

    for (const label of ['Active', 'Inactive', 'Expired', 'Scheduled', 'Limit reached']) {
      expect(within(table).getByText(label)).toBeInTheDocument()
    }
  })

  // P
  it('formats the validity window', async () => {
    const start = '2026-03-05T00:00:00.000Z'
    const end = '2026-09-20T00:00:00.000Z'
    mock.onGet('/admin/coupons').reply(
      200,
      listResponse([
        buildCoupon({ id: 'a', code: 'ALWAYS' }),
        buildCoupon({ id: 'b', code: 'STARTONLY', startsAt: start }),
        buildCoupon({ id: 'c', code: 'ENDONLY', expiresAt: end }),
        buildCoupon({ id: 'd', code: 'BOTH', startsAt: start, expiresAt: end }),
      ]),
    )

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('ALWAYS')

    expect(screen.getByText('Always')).toBeInTheDocument()
    expect(screen.getByText(`${formatDate(start)} – —`)).toBeInTheDocument()
    expect(screen.getByText(`— – ${formatDate(end)}`)).toBeInTheDocument()
    expect(screen.getByText(`${formatDate(start)} – ${formatDate(end)}`)).toBeInTheDocument()
  })

  // Q
  it('shows a fallback (not the raw UUID) for a category-scoped coupon whose category is unknown', async () => {
    mock.onGet('/admin/coupons').reply(
      200,
      listResponse([
        buildCoupon({ scopeType: 'CATEGORY', categoryId: 'deleted-cat-9999' }),
      ]),
    )

    renderWithProviders(<AdminCouponsPage />)

    expect(await screen.findByText('Category (inactive/unknown)')).toBeInTheDocument()
    expect(screen.queryByText('deleted-cat-9999')).not.toBeInTheDocument()
  })

  // R
  it('confirms in a modal before deactivating, and only PATCHes on confirm', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').replyOnce(200, listResponse([buildCoupon()]))
    mock.onPatch('/admin/coupons/coupon-1').reply(200, { success: true, data: buildCoupon({ isActive: false }) })
    mock.onGet('/admin/coupons').reply(200, listResponse([buildCoupon({ isActive: false })]))

    renderWithProviders(<AdminCouponsPage />)
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))

    const dialog = screen.getByRole('dialog', { name: 'Deactivate coupon' })
    expect(mock.history.patch).toHaveLength(0)

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mock.history.patch).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Deactivate' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }),
    )

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(bodyOf(mock.history.patch[0])).toEqual({ isActive: false })
    expect(await screen.findByRole('button', { name: 'Activate' })).toBeInTheDocument()
  })

  // S
  it('activates an inactive coupon immediately with no modal', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').replyOnce(200, listResponse([buildCoupon({ isActive: false })]))
    mock.onPatch('/admin/coupons/coupon-1').reply(200, { success: true, data: buildCoupon() })
    mock.onGet('/admin/coupons').reply(200, listResponse([buildCoupon()]))

    renderWithProviders(<AdminCouponsPage />)
    await user.click(await screen.findByRole('button', { name: 'Activate' }))

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(bodyOf(mock.history.patch[0])).toEqual({ isActive: true })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // T
  it('surfaces a state-mutation error through an Alert', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([buildCoupon()]))
    mock.onPatch('/admin/coupons/coupon-1').reply(500)

    renderWithProviders(<AdminCouponsPage />)
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }),
    )

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
  })

  // U
  it('shows a page-level skeleton (polite loading status) while the first fetch is in flight', () => {
    mock.onGet('/admin/coupons').reply(() => new Promise(() => {}))

    renderWithProviders(<AdminCouponsPage />)

    expect(screen.getByText('Loading').closest('[role="status"]')).toBeInTheDocument()
  })

  // V
  it('surfaces a list fetch error through the shared Alert', async () => {
    mock.onGet('/admin/coupons').reply(500)

    renderWithProviders(<AdminCouponsPage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/something went wrong/i)
  })

  // W
  it('shows the empty state with a New coupon action, hidden once the create form opens', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([]))

    renderWithProviders(<AdminCouponsPage />)
    expect(await screen.findByText('No coupons yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'New coupon' }).length).toBeGreaterThanOrEqual(1)

    await openNewCoupon(user)
    expect(screen.queryByText('No coupons yet')).not.toBeInTheDocument()
  })

  // X
  it('renders a semantic table with the expected column headers', async () => {
    mock.onGet('/admin/coupons').reply(200, listResponse([buildCoupon()]))

    renderWithProviders(<AdminCouponsPage />)
    const table = await screen.findByRole('table')

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Code', 'Discount', 'Scope', 'Min order', 'Usage', 'Validity', 'Status', 'Actions'])
  })

  // Y
  it('renders exactly one h1 titled "Coupons"', async () => {
    mock.onGet('/admin/coupons').reply(200, listResponse([buildCoupon()]))

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('SAVE10')

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Coupons')
  })

  // Z / AA
  it('has no search control and no unsupported filters', async () => {
    mock.onGet('/admin/coupons').reply(200, listResponse([buildCoupon()]))

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('SAVE10')

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Category')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/expir/i)).not.toBeInTheDocument()
  })

  // AB
  it('surfaces a duplicate-code backend error verbatim', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([]))
    mock.onPost('/admin/coupons').reply(409, {
      success: false,
      error: { code: 'CONFLICT', message: 'A coupon with this code already exists', details: [] },
    })

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('No coupons yet')
    await openNewCoupon(user)
    await user.type(screen.getByLabelText('Code'), 'SAVE10')
    await user.type(screen.getByLabelText('Percentage off (1-100)'), '10')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    expect(await screen.findByText('A coupon with this code already exists')).toBeInTheDocument()
  })
})
