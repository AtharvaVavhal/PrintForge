import { SetMetadata } from '@nestjs/common';
import type { FeatureKey } from '../platform/platform-plans/catalogue.constants';

export const REQUIRE_FEATURE_KEY = 'requireFeature';

/**
 * Phase 6 W4. Mirrors `@RequirePermission`'s exact shape and convention
 * (`auth/permissions/require-permission.decorator.ts`) — a single
 * `SetMetadata` call, one value per route, no new mechanism invented.
 * `EntitlementGuard` reads this via `Reflector.getAllAndOverride`, so
 * method-level metadata overrides class-level metadata automatically (the
 * same precedence `PermissionsGuard`/`PlatformGuard` already get for free
 * from that Nest API) — no extra code needed for that requirement.
 *
 * Takes exactly one `FeatureKey` — this codebase has no route today that
 * needs more than one feature gated at once, so no AND/OR combinator is
 * implemented; inventing one without a concrete need would be exactly the
 * kind of undocumented architecture decision the W4 authorization forbids.
 * `FeatureKey` is the same ratified, TS-checked catalogue type
 * `platform-plans/catalogue.constants.ts` already defines (Phase 6 W1) —
 * this decorator introduces no new catalogue, no alias, and no
 * normalization of an arbitrary string into a feature key.
 */
export const RequireFeature = (
  featureKey: FeatureKey,
): ReturnType<typeof SetMetadata> =>
  SetMetadata(REQUIRE_FEATURE_KEY, featureKey);
