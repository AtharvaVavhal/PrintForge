import type { ApiSuccessResponse } from '@/types/api'
import { apiClient } from './client'

export interface HeroSlide {
  imageUrl: string
  headline: string
  subtext: string
  ctaText: string
  ctaLink: string
}

export interface Banner {
  imageUrl: string
  title?: string
  text?: string
  link?: string
}

export interface ShowcaseCategory {
  categoryId: string
  imageUrl: string
  title: string
}

export interface HomepageSettings {
  hero_slides?: HeroSlide[]
  banners?: Banner[]
  showcase_categories?: ShowcaseCategory[]
}

export async function fetchHomepageSettings(): Promise<HomepageSettings> {
  const res = await apiClient.get<ApiSuccessResponse<HomepageSettings>>('/settings', {
    params: { keys: 'hero_slides,banners,showcase_categories' },
  })
  return res.data.data ?? {}
}
