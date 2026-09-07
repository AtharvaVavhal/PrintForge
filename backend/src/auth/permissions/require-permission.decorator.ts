import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permission';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

/**
 * Replaces `@Roles(Role.ADMIN)` (SaaS Master Plan §9; decisions P2-D9,
 * G-13). `PermissionsGuard` checks the resolved `TenantContext`'s
 * membership role against the ratified `TenantRole → Set<Permission>` map
 * (`permission.ts`) — deny by default, no entry means no access.
 */
export const RequirePermission = (
  permission: Permission,
): ReturnType<typeof SetMetadata> =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);
