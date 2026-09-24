import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { fetchStorefrontContext } from "@/services/api/storefront";
import { StoreContext, type StoreContextValue } from "./storeContext";

/**
 * Phase 9 W7 (spec §10.4) — fetches `GET /storefront/context` once at app boot
 * and exposes `{ storeId, storeName, canonicalOrigin, storeStatus }` to the
 * tree. **The seam, not the system:** in Phase 9 its only consumers are the
 * SEO layer (`useSiteOrigin` → canonical / og:url / JSON-LD urls, §10.1–10.2).
 * Theme tokens, branding, homepage structure and query-key namespacing are
 * Phase 12 (§20) and deliberately absent here.
 *
 * FAILS OPEN, BY DESIGN. A storefront must render when this bootstrap fails —
 * the endpoint is a nicety for SEO correctness, not a gate on the page. So
 * `children` are rendered unconditionally and consumers fall back to
 * `window.location.origin`; the query does not retry aggressively and never
 * blocks paint. On a host the backend does not serve, this endpoint 404s and
 * the app still renders (the store's DATA calls are what actually fail, with
 * their own error states).
 */
export function StoreContextProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["storefront", "context"],
    queryFn: fetchStorefrontContext,
    // One boot-time read: the answer is a property of the HOST, which cannot
    // change without a full page load.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const value: StoreContextValue = {
    context: data ?? null,
    isLoading,
    isError,
  };

  return <StoreContext value={value}>{children}</StoreContext>;
}
