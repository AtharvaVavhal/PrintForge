import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import type { HeroSlide } from '@/services/api/settings'
import { HeroCarousel } from './HeroCarousel'

function slide(overrides: Partial<HeroSlide> = {}): HeroSlide {
  return {
    imageUrl: '',
    headline: 'Headline',
    subtext: 'Subtext',
    ctaText: 'Shop now',
    ctaLink: '/products',
    ...overrides,
  }
}

describe('HeroCarousel — heading hierarchy (UX-14)', () => {
  it('exposes exactly one <h1> (the active slide) even with several slides', () => {
    renderWithProviders(
      <HeroCarousel
        slides={[
          slide({ headline: 'First slide' }),
          slide({ headline: 'Second slide' }),
          slide({ headline: 'Third slide' }),
        ]}
      />,
    )

    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent('First slide')
  })

  it('renders a single slide headline as the sole <h1>', () => {
    renderWithProviders(<HeroCarousel slides={[slide({ headline: 'Only slide' })]} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Only slide' })).toBeInTheDocument()
  })
})
