/**
 * Catalog data (categories, products) is public, read-heavy, and changes
 * rarely — a 5-minute staleTime is appropriate. Deliberately NOT the
 * zero-staleTime/refetchOnWindowFocus pattern the cart will need later
 * (§18: cart is `staleTime: 0`, invalidated after every mutation) — that
 * pattern is wrong here and shouldn't be copied.
 */
export const CATALOG_STALE_TIME_MS = 5 * 60 * 1000
