import { resolveSiteOrigin } from "@/seo/siteConfig";
import { useStoreContext } from "./useStoreContext";

/**
 * Phase 9 W7 (spec §10.1) — the origin every absolute SEO URL is built from,
 * for THIS browser on THIS host. A hook rather than a module constant so the
 * value updates when the `GET /storefront/context` bootstrap resolves: on a
 * non-primary served host the canonical URL must point at the primary host,
 * and that fact is only known after the fetch returns.
 *
 * With no provider mounted it degrades to `window.location.origin` — see
 * `useStoreContext`.
 */
export function useSiteOrigin(): string {
  const { context } = useStoreContext();
  return resolveSiteOrigin(context?.canonicalOrigin ?? null);
}
