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

/**
 * `GET /settings?keys=…` is the one bulk public-settings read. Its wire
 * shape is `{ success, data: { data: Record<string, string> } }` — the
 * controller returns `{ data: <map> }` and the response interceptor wraps
 * that again (it has no `meta` to lift), so the settings map sits at
 * `res.data.data.data`. This shape is deliberate and e2e-locked
 * (admin-control-plane.e2e-spec.ts), so it is unwrapped here, not fixed
 * upstream.
 *
 * Every value in the map is a raw string straight from the `value` TEXT
 * column. `hero_slides` / `banners` / `showcase_categories` store a JSON
 * array as a string, so each is `JSON.parse`d here. A missing key,
 * unparseable JSON, or a non-array payload all collapse to `undefined`
 * for that field — the homepage then falls back to its neutral layout
 * rather than throwing.
 */
export async function fetchHomepageSettings(): Promise<HomepageSettings> {
  const res = await apiClient.get<ApiSuccessResponse<{ data: Record<string, string> }>>('/settings', {
    params: { keys: 'hero_slides,banners,showcase_categories' },
  })
  const raw = res.data.data?.data ?? {}

  const parseList = <T>(value: string | undefined): T[] | undefined => {
    if (!value) return undefined
    try {
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as T[]) : undefined
    } catch {
      return undefined
    }
  }

  return {
    hero_slides: parseList<HeroSlide>(raw.hero_slides),
    banners: parseList<Banner>(raw.banners),
    showcase_categories: parseList<ShowcaseCategory>(raw.showcase_categories),
  }
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
