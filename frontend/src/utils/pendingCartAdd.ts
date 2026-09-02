import type { CustomizationValueDto } from '@/types/customization'

/**
 * A single "add to cart" the customer configured while logged out, stashed
 * so it survives the login redirect and can be completed on return.
 *
 * Stored in `sessionStorage` (cleared when the tab closes — never a
 * long-lived cross-session artifact) keyed by product slug, with a short
 * TTL so a stale intent can never be silently added days later. Every
 * access is wrapped so a storage-disabled / private-mode browser degrades
 * to "no pending add" rather than throwing.
 */
export interface PendingCartAdd {
  productId: string
  slug: string
  variantId?: string
  quantity: number
  customizations: CustomizationValueDto[]
  savedAt: number
}

const KEY_PREFIX = 'pf_pending_cart_add:'
const TTL_MS = 30 * 60 * 1000

function storageKey(slug: string): string {
  return `${KEY_PREFIX}${slug}`
}

export function savePendingCartAdd(entry: Omit<PendingCartAdd, 'savedAt'>): void {
  try {
    const payload: PendingCartAdd = { ...entry, savedAt: Date.now() }
    window.sessionStorage.setItem(storageKey(entry.slug), JSON.stringify(payload))
  } catch {
    // Storage unavailable — the customer just re-selects after login.
  }
}

/**
 * Reads and **removes** the pending add for `slug` in one step, returning
 * it only when it is well-formed and still within the TTL. Read-and-delete
 * makes the resume path naturally idempotent (a StrictMode double-invoke
 * or a re-render can't add the item twice).
 */
export function consumePendingCartAdd(slug: string): PendingCartAdd | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(slug))
    if (raw === null) return null
    window.sessionStorage.removeItem(storageKey(slug))

    const parsed = JSON.parse(raw) as Partial<PendingCartAdd>
    if (
      !parsed ||
      parsed.slug !== slug ||
      typeof parsed.productId !== 'string' ||
      typeof parsed.quantity !== 'number' ||
      !Array.isArray(parsed.customizations) ||
      typeof parsed.savedAt !== 'number'
    ) {
      return null
    }
    if (Date.now() - parsed.savedAt > TTL_MS) return null

    return {
      productId: parsed.productId,
      slug,
      variantId: parsed.variantId,
      quantity: parsed.quantity,
      customizations: parsed.customizations,
      savedAt: parsed.savedAt,
    }
  } catch {
    return null
  }
}

export function clearPendingCartAdd(slug: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(slug))
  } catch {
    // no-op
  }
}
