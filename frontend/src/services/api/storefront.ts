import type { ApiSuccessResponse } from "@/types/api";
import { apiClient } from "./client";

/**
 * `GET /storefront/context` — the Phase 9 W4 bootstrap endpoint (spec §10.4).
 * `@Public()`: it is called once at app boot, before any login, to learn which
 * store this browser is looking at.
 *
 * `canonicalOrigin` is `null` in `legacy_single_store` mode (there is no
 * per-store canonical host to report) and `https://<primary hostname>` in
 * `host_resolution` mode — including when this browser is on a NON-primary
 * served host, which is exactly how the SPA learns to canonicalise itself
 * (§11, S-10). The API never redirects for this.
 */
export interface StorefrontContext {
  storeId: string | null;
  storeName: string | null;
  storeStatus: "DRAFT" | "ACTIVE" | "DISABLED" | null;
  canonicalOrigin: string | null;
  isPrimary: boolean;
  resolvedBy: "origin" | "legacy";
}

export async function fetchStorefrontContext(): Promise<StorefrontContext> {
  const res = await apiClient.get<ApiSuccessResponse<StorefrontContext>>(
    "/storefront/context",
  );
  return res.data.data;
}
