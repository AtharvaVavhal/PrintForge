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

/** The customer-facing store name shown in the storefront chrome. Read from
 * the public `GET /settings/:key` surface (same one the announcement bar
 * uses). The backend already substitutes the "PrintForge" default when no
 * value has been saved; `null` here means the endpoint was unreachable, and
 * the caller falls back on its own. `storeAdminName` is intentionally NOT
 * fetched — it is never public. */
export async function fetchStoreName(): Promise<string | null> {
  const res = await apiClient.get<ApiSuccessResponse<{ value: string | null }>>(
    '/settings/storeName',
  )
  return res.data.data?.value ?? null
}

// ─── Admin: configurable app settings ──────────────────────────────────

/** Mirrors backend AdminSettingView (app-setting.service.ts). `kind`
 * drives the input type in the admin form; `value` is the current value
 * (or the server-side default when no row exists yet). */
export interface AdminSettingView {
  key: string
  label: string
  description: string
  kind: 'money' | 'text' | 'boolean' | 'enum' | 'percent'
  value: string
  default: string
  /** Allowed values for `kind: 'enum'`. */
  options?: string[]
  /** True for values that must be supplied by the client/accountant and
   * ship blank (Phase 13.4) — the admin UI flags these as pending. */
  pendingClientInput?: boolean
}

/** GET /admin/settings — admin-role required server-side. Only the
 * allowlisted, validated settings; never internal keys. */
export async function fetchAdminSettings(): Promise<AdminSettingView[]> {
  const res = await apiClient.get<ApiSuccessResponse<AdminSettingView[]>>('/admin/settings')
  return res.data.data
}

/** PATCH /admin/settings/:key — the value is re-validated server-side per
 * key (money format / non-negative / length); an invalid value returns a
 * 400 with a specific message. */
export async function updateAdminSetting(
  key: string,
  value: string,
): Promise<AdminSettingView> {
  const res = await apiClient.patch<ApiSuccessResponse<AdminSettingView>>(
    `/admin/settings/${encodeURIComponent(key)}`,
    { value },
  )
  return res.data.data
}
