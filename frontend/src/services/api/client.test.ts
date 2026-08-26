import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { apiClient } from './client'
import { clearAuth, getAccessToken } from './authStore'

/**
 * §18 Phase 1 item 8 — proves the interceptor's actual concurrency
 * contract, not just that it "eventually works": N requests failing with
 * 401 at the same moment must trigger exactly one POST /auth/refresh, and
 * every one of those N original requests must resolve successfully after
 * retrying with the token that single refresh produced.
 *
 * Two separate mock adapters: `apiMock` on `apiClient` (what every normal
 * request goes through), `rootMock` on the bare `axios` import — because
 * client.ts's performRefresh() deliberately calls `axios.post`, not
 * `apiClient`, to structurally prevent the refresh call from ever
 * re-entering apiClient's own response interceptor.
 */
describe('apiClient response interceptor — single-flight refresh', () => {
  let apiMock: MockAdapter
  let rootMock: MockAdapter

  beforeEach(() => {
    clearAuth()
    apiMock = new MockAdapter(apiClient)
    rootMock = new MockAdapter(axios)
  })

  afterEach(() => {
    apiMock.restore()
    rootMock.restore()
  })

  it('calls /auth/refresh exactly once for N concurrently-failing requests, and retries all N with the new token', async () => {
    let refreshCallCount = 0

    rootMock.onPost('/auth/refresh').reply(() => {
      refreshCallCount += 1
      return [
        200,
        {
          success: true,
          data: {
            accessToken: 'fresh-token',
            user: {
              id: 'user-1',
              email: 'shopper@example.test',
              role: 'CUSTOMER',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          },
        },
      ]
    })

    // Every /protected call 401s until it's carrying the post-refresh
    // token — simulates a genuinely expired access token, not a canned
    // call-count trick.
    apiMock.onGet('/protected').reply((config) => {
      if (config.headers?.Authorization === 'Bearer fresh-token') {
        return [200, { success: true, data: { ok: true } }]
      }
      return [
        401,
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', details: [] } },
      ]
    })

    const responses = await Promise.all([
      apiClient.get<{ success: true; data: { ok: boolean } }>('/protected'),
      apiClient.get<{ success: true; data: { ok: boolean } }>('/protected'),
      apiClient.get<{ success: true; data: { ok: boolean } }>('/protected'),
      apiClient.get<{ success: true; data: { ok: boolean } }>('/protected'),
      apiClient.get<{ success: true; data: { ok: boolean } }>('/protected'),
    ])

    expect(refreshCallCount).toBe(1)
    for (const res of responses) {
      expect(res.status).toBe(200)
      expect(res.data.data.ok).toBe(true)
    }
    expect(getAccessToken()).toBe('fresh-token')
  })

  it('clears auth and rejects without a recursive refresh attempt when /auth/refresh itself 401s', async () => {
    let refreshCallCount = 0

    rootMock.onPost('/auth/refresh').reply(() => {
      refreshCallCount += 1
      return [
        401,
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token', details: [] } },
      ]
    })
    apiMock.onGet('/protected').reply(401, {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized', details: [] },
    })

    const results = await Promise.allSettled([
      apiClient.get('/protected'),
      apiClient.get('/protected'),
      apiClient.get('/protected'),
    ])

    expect(refreshCallCount).toBe(1)
    for (const result of results) {
      expect(result.status).toBe('rejected')
    }
    expect(getAccessToken()).toBeNull()
  })
})
