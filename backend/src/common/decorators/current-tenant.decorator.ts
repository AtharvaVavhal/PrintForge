import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import {
  RequestWithTenantContext,
  TenantContext,
} from '../tenant/tenant-context';

/**
 * Phase 4 W7 (decision P4-D2's create-path fix). The merchant-side
 * counterpart of `@CurrentUser()` — reads the ALREADY-RESOLVED
 * `request.tenantContext` that `TenantContextGuard` (the only place that
 * constructs it, per its own header comment) set earlier in the guard
 * chain. Never reads a client-supplied tenant identifier directly.
 *
 * Only usable on routes where a tenant context is guaranteed — in
 * practice, any route behind `@RequirePermission(...)` (`PermissionsGuard`
 * already denies the request with no context before a handler using this
 * decorator would ever run), or a route that has independently confirmed
 * `request.tenantContext` is set. Throws defensively if it is not, rather
 * than ever returning a fabricated/default tenant.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx
      .switchToHttp()
      .getRequest<RequestWithTenantContext>();
    if (!request.tenantContext) {
      throw new ForbiddenException('No active tenant context for this request');
    }
    return request.tenantContext;
  },
);
