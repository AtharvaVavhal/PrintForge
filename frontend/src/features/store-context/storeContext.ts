import { createContext } from "react";
import type { StorefrontContext } from "@/services/api/storefront";

export interface StoreContextValue {
  /** `null` until the bootstrap resolves, and when it fails. */
  context: StorefrontContext | null;
  /** True while the one boot-time fetch is in flight. */
  isLoading: boolean;
  /** True when the bootstrap failed — the app renders on fallbacks. */
  isError: boolean;
}

/**
 * The default is the SAFE FALLBACK (spec §14.6: "renders children with
 * context after bootstrap and with a safe fallback when the bootstrap
 * fails"). It is also what a component tree rendered WITHOUT the provider
 * sees — every consumer must therefore work with no store context at all,
 * which is why `useSiteOrigin()` falls back to `window.location.origin`
 * rather than requiring a provider.
 */
export const STORE_CONTEXT_FALLBACK: StoreContextValue = {
  context: null,
  isLoading: false,
  isError: false,
};

export const StoreContext = createContext<StoreContextValue>(
  STORE_CONTEXT_FALLBACK,
);
