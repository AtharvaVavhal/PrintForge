import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ONLY_KEY = 'platformOnly';

/**
 * Marks a route (or controller) as platform-scoped: PlatformGuard then admits
 * only a User whose `platformRole === SUPER_ADMIN`.
 *
 * SaaS Master Plan §8 · decisions P2-D1 / G-11 (docs/saas/DECISIONS.md v1.2).
 * Completely separate from `@Roles()` / RolesGuard and from any tenant
 * membership or permission (frozen SaaS invariant 4).
 *
 * Ratified Phase 2a as a dormant foundation capability (no route used it
 * yet). Phase 5 W3's platform console (`platform/platform.controller.ts`)
 * is its first real consumer — `grep -r "@PlatformOnly" src` outside this
 * file / its tests / `platform.controller.ts` should return nothing;
 * `common/guards/platform.guard.spec.ts` pins the exact enumerated set.
 */
export const PlatformOnly = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(PLATFORM_ONLY_KEY, true);
