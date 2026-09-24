import { useContext } from "react";
import { StoreContext, type StoreContextValue } from "./storeContext";

/**
 * Never throws when no provider is mounted — it yields the safe fallback
 * (`storeContext.ts`). Deliberate: the SEO layer consumes this from
 * components that are also rendered in isolation by unit tests and by
 * non-storefront trees (the admin shell), and a hook that threw there would
 * push provider plumbing into places that have no store at all.
 */
export function useStoreContext(): StoreContextValue {
  return useContext(StoreContext);
}
