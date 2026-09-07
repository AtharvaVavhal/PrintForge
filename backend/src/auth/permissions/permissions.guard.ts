import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithTenantContext } from '../../common/tenant/tenant-context';
import { can, type Permission } from './permission';
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator';

/**
 * Replaces `RolesGuard` (SaaS Master Plan §9; decisions P2-D9, G-13, G-20).
 * Registered globally, after `TenantContextGuard` (so `request.tenantContext`
 * is already populated) — see `app.module.ts`.
 *
 * Deny-by-default: no `@RequirePermission(...)` metadata → pass through
 * (mirrors the legacy `RolesGuard`'s no-metadata behavior — a route with no
 * declared permission requirement is not tenant-gated by this guard, e.g. a
 * platform-only or public route). A route THAT DOES declare a required
 * permission but has no resolved `TenantContext` → 403 (no implicit
 * tenant). Independent of `PlatformGuard` — never both required on the same
 * handler (frozen SaaS invariant 4); a `SUPER_ADMIN` with no
 * `TenantMembership` has no entry in the permission map and is denied here
 * exactly like any other user with no membership.
 */
@Injectable()
export class PermissionsGuard {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const { tenantContext } = context
      .switchToHttp()
      .getRequest<RequestWithTenantContext>();

    if (!tenantContext?.membership) {
      throw new ForbiddenException('No active tenant context for this request');
    }

    if (!can(tenantContext.membership.role, required)) {
      throw new ForbiddenException('Insufficient permission for this resource');
    }

    return true;
  }
}
