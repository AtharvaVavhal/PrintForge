import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { createMockAuthContext, renderWithProviders } from '@/test/test-utils'
import type { AuthContextValue } from '@/features/auth/authContext'
import type { ReviewView } from '@/types/reviews'
import { ReviewList } from './ReviewList'

const PRODUCT_ID = 'prod-1'

function buildReview(overrides: Partial<ReviewView> = {}): ReviewView {
  return {
    id: 'rev-1',
    productId: PRODUCT_ID,
    userId: 'other-user',
    rating: 4,
    bodyText: 'Great mug, sturdy handle.',
    status: 'PUBLISHED',
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
    ...overrides,
  }
}

function listResponse(items: ReviewView[], meta: { page?: number; totalPages?: number } = {}) {
  return {
    success: true,
    data: items,
    meta: { page: meta.page ?? 1, limit: 10, total: items.length, totalPages: meta.totalPages ?? 1 },
  }
}

function renderReviewList(authValue?: AuthContextValue) {
  return renderWithProviders(
    <Routes>
      <Route path="/product" element={<ReviewList productId={PRODUCT_ID} />} />
      <Route path="/login" element={<div>Login Page</div>} />
    </Routes>,
    { initialEntries: ['/product'], authValue },
  )
}

const AUTHENTICATED = createMockAuthContext({
  status: 'authenticated',
  user: { id: 'user-1', email: 'shopper@example.test', role: 'CUSTOMER', createdAt: '2026-01-01T00:00:00.000Z' },
})

describe('ReviewList', () => {
  let mock: MockAdapter

  beforeEach(() => {
    mock = new MockAdapter(apiClient)
  })

  afterEach(() => {
    mock.restore()
  })

  it('renders an empty state when there are no reviews', async () => {
    mock.onGet(`/products/${PRODUCT_ID}/reviews`).reply(200, listResponse([]))

    renderReviewList()

    expect(await screen.findByText('No reviews yet.')).toBeInTheDocument()
  })

  it("renders each review's rating, body text, generic author label, and date", async () => {
    mock.onGet(`/products/${PRODUCT_ID}/reviews`).reply(
      200,
      listResponse([buildReview({ rating: 5, bodyText: 'Excellent quality.' })]),
    )

    renderReviewList()

    expect(await screen.findByText('Excellent quality.')).toBeInTheDocument()
    expect(screen.getByText('Verified buyer')).toBeInTheDocument()
    expect(screen.getByLabelText('5 out of 5 stars')).toBeInTheDocument()
    expect(screen.getByText('5 Jan 2026')).toBeInTheDocument()
    // No name/email anywhere — ReviewView has no such field.
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
  })

  it("tags the current user's own review with (You) and shows Edit/Delete instead of the write form", async () => {
    mock.onGet(`/products/${PRODUCT_ID}/reviews`).reply(
      200,
      listResponse([buildReview({ userId: 'user-1', bodyText: 'My own review' })]),
    )

    renderReviewList(AUTHENTICATED)

    expect(await screen.findByText('(You)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Write a review' })).not.toBeInTheDocument()
  })

  it('redirects an unauthenticated click on "Write a review" to /login without ever posting', async () => {
    const user = userEvent.setup()
    mock.onGet(`/products/${PRODUCT_ID}/reviews`).reply(200, listResponse([]))

    renderReviewList()
    await screen.findByText('No reviews yet.')

    await user.click(screen.getByRole('button', { name: 'Write a review' }))

    expect(await screen.findByText('Login Page')).toBeInTheDocument()
    expect(mock.history.post).toHaveLength(0)
  })

  it('submits a new review, then refetches the list to show it', async () => {
    const user = userEvent.setup()
    mock.onGet(`/products/${PRODUCT_ID}/reviews`).replyOnce(200, listResponse([]))
    mock.onPost('/reviews').reply(201, {
      success: true,
      data: buildReview({ id: 'rev-new', userId: 'user-1', rating: 5, bodyText: 'Loved it' }),
    })
    mock.onGet(`/products/${PRODUCT_ID}/reviews`).reply(
      200,
      listResponse([buildReview({ id: 'rev-new', userId: 'user-1', rating: 5, bodyText: 'Loved it' })]),
    )

    renderReviewList(AUTHENTICATED)
    await screen.findByText('No reviews yet.')

    await user.click(screen.getByRole('button', { name: 'Write a review' }))
    await user.click(screen.getByRole('radio', { name: '5 stars' }))
    await user.type(screen.getByLabelText('Your review (optional)'), 'Loved it')
    await user.click(screen.getByRole('button', { name: 'Submit review' }))

    await waitFor(() => expect(mock.history.post).toHaveLength(1))
    expect(JSON.parse(mock.history.post[0].data as string)).toEqual({
      productId: PRODUCT_ID,
      rating: 5,
      bodyText: 'Loved it',
    })
    expect(await screen.findByText('Loved it')).toBeInTheDocument()
    expect(await screen.findByText('(You)')).toBeInTheDocument()
  })

  it('surfaces the 409 verified-purchase rejection as a clear message, and leaves the form open', async () => {
    const user = userEvent.setup()
    mock.onGet(`/products/${PRODUCT_ID}/reviews`).reply(200, listResponse([]))
    mock.onPost('/reviews').reply(409, {
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'You can only review a product from an order that has been delivered to you',
        details: [],
      },
    })

    renderReviewList(AUTHENTICATED)
    await screen.findByText('No reviews yet.')

    await user.click(screen.getByRole('button', { name: 'Write a review' }))
    await user.click(screen.getByRole('button', { name: 'Submit review' }))

    expect(
      await screen.findByText('You can only review a product from an order that has been delivered to you'),
    ).toBeInTheDocument()
    // Form stays open for the user to retry/cancel, not silently dismissed.
    expect(screen.getByRole('button', { name: 'Submit review' })).toBeInTheDocument()
  })

  it("edits the user's own review via PATCH and reflects the change", async () => {
    const user = userEvent.setup()
    mock.onGet(`/products/${PRODUCT_ID}/reviews`).replyOnce(
      200,
      listResponse([buildReview({ id: 'rev-1', userId: 'user-1', rating: 3, bodyText: 'It was okay' })]),
    )
    mock.onPatch('/reviews/rev-1').reply(200, {
      success: true,
      data: buildReview({ id: 'rev-1', userId: 'user-1', rating: 5, bodyText: 'Actually great' }),
    })
    mock.onGet(`/products/${PRODUCT_ID}/reviews`).reply(
      200,
      listResponse([buildReview({ id: 'rev-1', userId: 'user-1', rating: 5, bodyText: 'Actually great' })]),
    )

    renderReviewList(AUTHENTICATED)
    await screen.findByText('It was okay')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('radio', { name: '5 stars' }))
    const bodyField = screen.getByLabelText('Your review (optional)')
    await user.clear(bodyField)
    await user.type(bodyField, 'Actually great')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mock.history.patch).toHaveLength(1))
    expect(JSON.parse(mock.history.patch[0].data as string)).toEqual({
      rating: 5,
      bodyText: 'Actually great',
    })
    expect(await screen.findByText('Actually great')).toBeInTheDocument()
  })

  it("deletes the user's own review and it disappears from the list", async () => {
    const user = userEvent.setup()
    mock.onGet(`/products/${PRODUCT_ID}/reviews`).replyOnce(
      200,
      listResponse([buildReview({ id: 'rev-1', userId: 'user-1', bodyText: 'Going away' })]),
    )
    mock.onDelete('/reviews/rev-1').reply(200, { success: true, data: undefined })
    // Soft-deleted server-side (status -> REMOVED); the public list is
    // unconditionally PUBLISHED-only, so the refetch simply omits it.
    mock.onGet(`/products/${PRODUCT_ID}/reviews`).reply(200, listResponse([]))

    renderReviewList(AUTHENTICATED)
    await screen.findByText('Going away')

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mock.history.delete).toHaveLength(1))
    expect(await screen.findByText('No reviews yet.')).toBeInTheDocument()
    expect(screen.queryByText('Going away')).not.toBeInTheDocument()
  })

  it('paginates via Previous/Next', async () => {
    const user = userEvent.setup()
    mock
      .onGet(`/products/${PRODUCT_ID}/reviews`, { params: { page: 1, limit: 10 } })
      .reply(200, listResponse([buildReview({ id: 'rev-page1', bodyText: 'Page one review' })], { page: 1, totalPages: 2 }))
    mock
      .onGet(`/products/${PRODUCT_ID}/reviews`, { params: { page: 2, limit: 10 } })
      .reply(200, listResponse([buildReview({ id: 'rev-page2', bodyText: 'Page two review' })], { page: 2, totalPages: 2 }))

    renderReviewList()
    await screen.findByText('Page one review')
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Page two review')).toBeInTheDocument()
    expect(screen.queryByText('Page one review')).not.toBeInTheDocument()
  })
})
