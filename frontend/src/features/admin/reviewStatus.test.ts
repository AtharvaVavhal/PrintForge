import { describe, expect, it } from 'vitest'
import { reviewStatusInfo } from './reviewStatus'

describe('reviewStatusInfo', () => {
  it('maps PUBLISHED to a success badge', () => {
    expect(reviewStatusInfo('PUBLISHED')).toEqual({ label: 'Published', variant: 'success' })
  })

  it('maps REJECTED to a danger badge', () => {
    expect(reviewStatusInfo('REJECTED')).toEqual({ label: 'Rejected', variant: 'danger' })
  })

  it('maps REMOVED to a neutral badge', () => {
    expect(reviewStatusInfo('REMOVED')).toEqual({ label: 'Removed', variant: 'neutral' })
  })

  it('always returns a visible text label', () => {
    for (const status of ['PUBLISHED', 'REJECTED', 'REMOVED'] as const) {
      expect(reviewStatusInfo(status).label.length).toBeGreaterThan(0)
    }
  })
})
