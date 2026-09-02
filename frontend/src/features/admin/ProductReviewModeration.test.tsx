import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { formatDate } from '@/utils/formatDate'
import { ProductReviewModeration } from './ProductReviewModeration'

const REVIEWS_URL = '/products/prod-1/reviews'

function buildReview(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rev-1',
    productId: 'prod-1',
    userId: 'user-9abc1234',
    rating: 4,
    bodyText: 'Great mug, arrived quickly',
    status: 'PUBLISHED',
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

function reviewCalls(mock: MockAdapter) {
  return mock.history.get.filter((r) => r.url === REVIEWS_URL)
}

function render() {
  return renderWithProviders(<ProductReviewModeration productId="prod-1" />)
}

describe('ProductReviewModeration', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  // 1
  it('renders the Reviews heading as an h2 (no h1)', async () => {
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview()]))
    render()

    await screen.findByText('Great mug, arrived quickly')
    expect(screen.getByRole('heading', { level: 2, name: 'Reviews' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  // 2
  it('renders a semantic table with the expected column headers', async () => {
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview()]))
    render()

    const table = await screen.findByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Rating', 'Review', 'Reviewer', 'Date', 'Status', 'Actions'])
  })

  // 3, 4
  it('renders the rating with an accessible label', async () => {
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview({ rating: 4 })]))
    render()

    expect(await screen.findByRole('img', { name: '4 out of 5 stars' })).toBeInTheDocument()
  })

  // 5
  it('renders the review body text', async () => {
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview({ bodyText: 'Solid quality' })]))
    render()

    expect(await screen.findByText('Solid quality')).toBeInTheDocument()
  })

  // 6
  it('shows an em dash when the review has no body', async () => {
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview({ bodyText: null })]))
    render()

    const row = (await screen.findByRole('img', { name: '4 out of 5 stars' })).closest(
      'tr',
    ) as HTMLElement
    expect(within(row).getByText('—')).toBeInTheDocument()
  })

  // 7
  it('shows a short derived reviewer token, not the raw UUID', async () => {
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview({ userId: 'user-9abc1234' })]))
    render()

    expect(await screen.findByText('#user9a')).toBeInTheDocument()
    expect(screen.queryByText('user-9abc1234')).not.toBeInTheDocument()
  })

  // 8
  it('renders the created date via formatDate', async () => {
    const createdAt = '2026-03-05T00:00:00.000Z'
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview({ createdAt })]))
    render()

    expect(await screen.findByText(formatDate(createdAt))).toBeInTheDocument()
  })

  // 9, 10, 11
  it('renders a text status badge for each review status', async () => {
    mock.onGet(REVIEWS_URL).reply(
      200,
      listResponse([
        buildReview({ id: 'a', status: 'PUBLISHED', bodyText: 'pub' }),
        buildReview({ id: 'b', status: 'REJECTED', bodyText: 'rej' }),
        buildReview({ id: 'c', status: 'REMOVED', bodyText: 'rem' }),
      ]),
    )
    render()

    await screen.findByText('pub')
    const table = screen.getByRole('table')
    expect(within(table).getByText('Published')).toBeInTheDocument()
    expect(within(table).getByText('Rejected')).toBeInTheDocument()
    expect(within(table).getByText('Removed')).toBeInTheDocument()
  })

  // 12
  it('shows a "No published reviews yet" empty state', async () => {
    mock.onGet(REVIEWS_URL).reply(200, listResponse([]))
    render()

    expect(await screen.findByText('No published reviews yet')).toBeInTheDocument()
  })

  // 13, 14
  it('exposes aria-busy and shows no data rows while the first fetch is in flight', () => {
    mock.onGet(REVIEWS_URL).reply(() => new Promise(() => {}))
    const { container } = render()

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByText('Great mug, arrived quickly')).not.toBeInTheDocument()
  })

  // 15
  it('surfaces a list query error in its own Alert', async () => {
    mock.onGet(REVIEWS_URL).reply(500, {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'List blew up', details: [] },
    })
    render()

    expect(await screen.findByText('List blew up')).toBeInTheDocument()
  })

  // 16, 27
  it('surfaces a moderation error and leaves the displayed status intact', async () => {
    const user = userEvent.setup()
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview()]))
    mock.onPatch('/admin/reviews/rev-1/status').reply(500, {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Moderation failed', details: [] },
    })
    render()

    await user.click(await screen.findByRole('button', { name: 'Reject' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Reject review' }),
    )

    expect(await screen.findByText('Moderation failed')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Published')).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  // 17
  it('renders AdminPagination when the backend reports multiple pages', async () => {
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview()], { totalPages: 2 }))
    render()

    await screen.findByText('Great mug, arrived quickly')
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })

  // 18, 19
  it('requests page 2 then page 1 as the admin pages back and forth', async () => {
    const user = userEvent.setup()
    mock.onGet(REVIEWS_URL).reply((config) => {
      const page = Number((config.params as { page?: number }).page ?? 1)
      return [
        200,
        listResponse([buildReview({ id: `p${page}`, bodyText: `page ${page}` })], {
          page,
          totalPages: 2,
        }),
      ]
    })
    render()

    await screen.findByText('page 1')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('page 2')
    expect(Number((reviewCalls(mock).at(-1)?.params as { page?: number }).page)).toBe(2)

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await screen.findByText('page 1')
    expect(Number((reviewCalls(mock).at(-1)?.params as { page?: number }).page)).toBe(1)
  })

  // 20, 22, 24, 25, 26
  it('rejects a published review through a confirmation modal and keeps the row visible', async () => {
    const user = userEvent.setup()
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview()]))
    mock
      .onPatch('/admin/reviews/rev-1/status')
      .reply(200, { success: true, data: buildReview({ status: 'REJECTED' }) })
    render()

    await user.click(await screen.findByRole('button', { name: 'Reject' }))

    const dialog = screen.getByRole('dialog', { name: 'Reject this review' })
    expect(dialog).toHaveTextContent(/no longer appear on the storefront/i)
    expect(dialog).toHaveTextContent(/rating and review count will be recalculated/i)
    expect(mock.history.patch).toHaveLength(0)

    const getCountBefore = reviewCalls(mock).length
    await user.click(within(dialog).getByRole('button', { name: 'Reject review' }))

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({ status: 'REJECTED' })

    // Row stays visible, status flips, and NO review-list refetch happened.
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Great mug, arrived quickly')).toBeInTheDocument()
    expect(within(table).getByText('Rejected')).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'Publish' })).toBeInTheDocument()
    expect(reviewCalls(mock).length).toBe(getCountBefore)
  })

  // 23
  it('does not mutate when the reject confirmation is cancelled', async () => {
    const user = userEvent.setup()
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview()]))
    render()

    await user.click(await screen.findByRole('button', { name: 'Reject' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mock.history.patch).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  // 21 (as supported by the chosen control) + restore path
  it('publishes a non-published review immediately with no modal', async () => {
    const user = userEvent.setup()
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview({ status: 'REMOVED' })]))
    mock
      .onPatch('/admin/reviews/rev-1/status')
      .reply(200, { success: true, data: buildReview({ status: 'PUBLISHED' }) })
    render()

    await user.click(await screen.findByRole('button', { name: 'Publish' }))

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({ status: 'PUBLISHED' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Published')).toBeInTheDocument()
  })

  // 28, 29, 30
  it('has no search, filter, sort, or verified-purchase controls', async () => {
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview()]))
    render()

    await screen.findByText('Great mug, arrived quickly')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/sort/i)).not.toBeInTheDocument()
  })

  // 31
  it('keeps the full review text discoverable via a title attribute', async () => {
    const longText = 'This is a very long review body '.repeat(20).trim()
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview({ bodyText: longText })]))
    render()

    expect(await screen.findByText(longText)).toHaveAttribute('title', longText)
  })

  // 32
  it('the reject control is keyboard operable', async () => {
    const user = userEvent.setup()
    mock.onGet(REVIEWS_URL).reply(200, listResponse([buildReview()]))
    render()

    const rejectButton = await screen.findByRole('button', { name: 'Reject' })
    rejectButton.focus()
    expect(rejectButton).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: 'Reject this review' })).toBeInTheDocument()
  })
})
