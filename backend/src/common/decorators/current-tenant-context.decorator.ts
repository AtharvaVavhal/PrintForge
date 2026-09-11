import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  RequestWithTenantContext,
  TenantContext,
} from '../tenant/tenant-context';

/**
 * Phase 5 W7. Exposes the already-resolved `request.tenantContext`
 * (`TenantContextGuard` / `SupportSessionContextGuard`) to a controller
 * method, the same way `@CurrentUser()` exposes `request.user` — a thin
 * accessor, not a new authorization mechanism. Any route that reaches a
 * handler using this decorator has already passed `PermissionsGuard`,
 * which itself refuses to run a `@RequirePermission(...)`-guarded handler
 * without a resolved `tenantContext` — so a caller may safely type this as
 * non-optional `TenantContext` on such a route, exactly like
 * `platform.controller.ts` safely types `@CurrentUser()` as a non-optional
 * `AuthenticatedUser`.
 */
export const CurrentTenantContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithTenantContext>();
    return request.tenantContext;
  },
);
