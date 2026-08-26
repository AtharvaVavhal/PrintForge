/**
 * §11: `product.minQuantity ≤ quantity ≤ (product.maxQuantity ?? PLATFORM_DEFAULT_MAX)`.
 * The blueprint names this constant but doesn't fix its value (not in §37's
 * TODO list either) — an implementation-level choice, set here rather than
 * in the shared common/constants file since only cart currently needs it.
 */
export const PLATFORM_DEFAULT_MAX_QUANTITY = 1000;
