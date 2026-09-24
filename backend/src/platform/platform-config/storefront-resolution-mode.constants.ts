/**
 * Phase 9 W2 — storefront domain-resolution kill-switch (decision P9-D8;
 * spec `docs/saas/PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md` §15).
 *
 * The switch lives in ONE `platform_config` row (W1 table), keyed by
 * `STOREFRONT_RESOLUTION_MODE_KEY`. Keys are code constants — never a
 * client-supplied string (spec §3.3, S-3).
 *
 * Exactly two valid values (spec §15 "Values"). Anything else stored in the
 * row is INVALID and is handled fail-closed (P9-S14) — see
 * `StorefrontResolutionModeService`. `VERIFYING`-style additions to this
 * set are not a code change but a new decision.
 */
export const STOREFRONT_RESOLUTION_MODE_KEY =
  'storefront.domain_resolution_mode';

export const STOREFRONT_RESOLUTION_MODES = [
  'legacy_single_store',
  'host_resolution',
] as const;

export type StorefrontResolutionMode =
  (typeof STOREFRONT_RESOLUTION_MODES)[number];

/**
 * Default when the row is ABSENT (spec §15 "Default when the row is
 * absent"): pre-Phase-9 behaviour is the fail-safe, so applying W1/W2 to
 * production changes nothing observable until an operator flips the flag
 * in W8. An absent row is NOT an invalid row (P9-S14) — only an absent row
 * ever yields this default implicitly.
 */
export const DEFAULT_STOREFRONT_RESOLUTION_MODE: StorefrontResolutionMode =
  'legacy_single_store';

/** Spec §15 "Read path": in-process cache, TTL 10 s, bust on write. */
export const STOREFRONT_RESOLUTION_MODE_CACHE_TTL_MS = 10_000;

/** Spec §15 "Who may flip": the one PlatformAuditLog action for this key. */
export const STOREFRONT_RESOLUTION_MODE_CHANGED_ACTION =
  'platform.config.storefront_resolution_mode_changed';

export function isStorefrontResolutionMode(
  value: unknown,
): value is StorefrontResolutionMode {
  return (
    typeof value === 'string' &&
    (STOREFRONT_RESOLUTION_MODES as readonly string[]).includes(value)
  );
}

/**
 * Where the effective mode came from (spec §15 "Read visibility": `row` /
 * `default`). `last_known_valid` appears ONLY in the P9-S14 degraded state
 * — the stored value is invalid or unreadable and the previously observed
 * valid mode is being served instead — so an operator reading
 * `GET /platform/config/storefront-domain-resolution` can see that the
 * row needs fixing even though requests are still being served.
 */
export type StorefrontResolutionModeSource =
  'row' | 'default' | 'last_known_valid';

export interface EffectiveStorefrontResolutionMode {
  mode: StorefrontResolutionMode;
  source: StorefrontResolutionModeSource;
}
