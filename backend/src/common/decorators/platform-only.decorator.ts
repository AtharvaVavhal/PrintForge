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
 * Phase 2a FOUNDATION ONLY — NO route in the codebase uses this decorator yet.
 * The platform console (Phase 5) is its first consumer. `grep -r "@PlatformOnly"
 * src` outside this file / its tests should return nothing.
 */
export const PlatformOnly = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(PLATFORM_ONLY_KEY, true);
