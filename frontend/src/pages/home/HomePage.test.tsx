import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from '@/services/api/client'
import { renderWithProviders } from '@/test/test-utils'
import { HomePage } from './HomePage'

let mock: MockAdapter

beforeEach(() => {
  mock = new MockAdapter(apiClient)
  // Empty homepage settings -> the content branch renders (not the error fallback).
  mock.onGet('/settings').reply(200, { success: true, data: {} })
})

afterEach(() => {
  mock.restore()
})

describe('HomePage content integrity', () => {
  it('does not present fabricated testimonials as real customer feedback', async () => {
    renderWithProviders(<HomePage />)
    // Wait for the settings query to settle and the content branch to render.
    await screen.findByRole('heading', { name: /create custom prints/i })

    expect(screen.queryByText(/what our customers say/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/verified printforge customers/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/priya s\.?/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/rahul m\.?/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/anita k\.?/i)).not.toBeInTheDocument()
  })

  it('does not show a fake newsletter subscription', async () => {
    renderWithProviders(<HomePage />)
    await screen.findByRole('heading', { name: /create custom prints/i })

    expect(screen.queryByText(/stay updated/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /subscribe/i }),
    ).not.toBeInTheDocument()
    // No copy that claims a subscription happened.
    expect(screen.queryByText(/subscribed!?/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/you agree to receive marketing emails/i),
    ).not.toBeInTheDocument()
  })
})
