import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { AdminCouponsPage } from './AdminCouponsPage'

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111'

const CATEGORIES_RESPONSE = {
  success: true,
  data: [{ id: CATEGORY_ID, name: 'Drinkware', slug: 'drinkware', parentCategoryId: null }],
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

function listResponse(items: Record<string, unknown>[]) {
  return { success: true, data: items, meta: { page: 1, limit: 20, total: items.length, totalPages: 1 } }
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

  it('lists coupons with a human-readable type/scope/usage summary', async () => {
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

    expect(screen.getByText('CATSAVE')).toBeInTheDocument()
    expect(screen.getByText('₹50.00 off')).toBeInTheDocument()
    expect(screen.getByText('Category: Drinkware')).toBeInTheDocument()
    expect(screen.getByText('Used 3 / 100')).toBeInTheDocument()
  })

  it('creates a PERCENTAGE coupon, showing percentageOff and never flatAmountOff', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([]))
    mock.onPost('/admin/coupons').reply(201, { success: true, data: buildCoupon() })

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('No coupons yet.')

    await user.click(screen.getByRole('button', { name: 'New coupon' }))
    expect(screen.getByLabelText('Percentage off (1-100)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Flat amount off')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Code'), 'save10')
    await user.type(screen.getByLabelText('Percentage off (1-100)'), '10')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    await waitFor(() => expect(mock.history.post.length).toBe(1))
    const body = JSON.parse(mock.history.post[0].data as string) as Record<string, unknown>
    expect(body).toEqual({
      code: 'save10',
      type: 'PERCENTAGE',
      percentageOff: 10,
      scopeType: 'STORE_WIDE',
      firstOrderOnly: false,
    })
  })

  it('switching type to FLAT_AMOUNT shows flatAmountOff instead of percentageOff', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([]))
    mock.onPost('/admin/coupons').reply(201, { success: true, data: buildCoupon({ type: 'FLAT_AMOUNT' }) })

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('No coupons yet.')
    await user.click(screen.getByRole('button', { name: 'New coupon' }))

    await user.selectOptions(screen.getByLabelText('Type'), 'FLAT_AMOUNT')
    expect(screen.queryByLabelText('Percentage off (1-100)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Flat amount off')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Code'), 'FLAT50')
    await user.type(screen.getByLabelText('Flat amount off'), '50')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    await waitFor(() => expect(mock.history.post.length).toBe(1))
    const body = JSON.parse(mock.history.post[0].data as string) as Record<string, unknown>
    expect(body).toMatchObject({ type: 'FLAT_AMOUNT', flatAmountOff: 50 })
    expect(body.percentageOff).toBeUndefined()
  })

  it('selecting CATEGORY scope requires and sends categoryId', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([]))
    mock.onPost('/admin/coupons').reply(201, { success: true, data: buildCoupon({ scopeType: 'CATEGORY' }) })

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('No coupons yet.')
    await user.click(screen.getByRole('button', { name: 'New coupon' }))

    await user.type(screen.getByLabelText('Code'), 'CATSAVE')
    await user.type(screen.getByLabelText('Percentage off (1-100)'), '15')
    await user.selectOptions(screen.getByLabelText('Scope'), 'CATEGORY')

    expect(await screen.findByLabelText('Category')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    // categoryId is required once CATEGORY scope is selected — rejected
    // client-side, never posted with an empty categoryId.
    expect(await screen.findByText('Required for a category-scoped coupon')).toBeInTheDocument()
    expect(mock.history.post).toHaveLength(0)

    await user.selectOptions(screen.getByLabelText('Category'), CATEGORY_ID)
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    await waitFor(() => expect(mock.history.post.length).toBe(1))
    const body = JSON.parse(mock.history.post[0].data as string) as Record<string, unknown>
    expect(body).toMatchObject({ scopeType: 'CATEGORY', categoryId: CATEGORY_ID })
  })

  it('requires percentageOff for a PERCENTAGE coupon before submitting', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([]))

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('No coupons yet.')
    await user.click(screen.getByRole('button', { name: 'New coupon' }))

    await user.type(screen.getByLabelText('Code'), 'BADCODE')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    expect(await screen.findByText('Required for a percentage-off coupon')).toBeInTheDocument()
    expect(mock.history.post).toHaveLength(0)
  })

  it("edits a coupon's limits without ever rendering code or type as editable fields", async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').replyOnce(200, listResponse([buildCoupon()]))
    mock.onPatch('/admin/coupons/coupon-1').reply(200, {
      success: true,
      data: buildCoupon({ usageLimitTotal: 50 }),
    })
    mock.onGet('/admin/coupons').reply(200, listResponse([buildCoupon({ usageLimitTotal: 50 })]))

    renderWithProviders(<AdminCouponsPage />)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    // Neither an editable code field nor a type selector exists in edit mode.
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Type')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Total usage limit (optional)'), '50')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mock.history.patch.length).toBe(1))
    const body = JSON.parse(mock.history.patch[0].data as string) as Record<string, unknown>
    expect(body).toEqual({ usageLimitTotal: 50, usageLimitPerUser: 1, firstOrderOnly: false, isActive: true })
    expect(await screen.findByText('Used 0 / 50')).toBeInTheDocument()
  })

  it('surfaces a backend rejection on create without collapsing it to a generic message', async () => {
    const user = userEvent.setup()
    mock.onGet('/admin/coupons').reply(200, listResponse([]))
    mock.onPost('/admin/coupons').reply(409, {
      success: false,
      error: { code: 'CONFLICT', message: 'A coupon with this code already exists', details: [] },
    })

    renderWithProviders(<AdminCouponsPage />)
    await screen.findByText('No coupons yet.')
    await user.click(screen.getByRole('button', { name: 'New coupon' }))
    await user.type(screen.getByLabelText('Code'), 'SAVE10')
    await user.type(screen.getByLabelText('Percentage off (1-100)'), '10')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    expect(await screen.findByText('A coupon with this code already exists')).toBeInTheDocument()
  })
})
