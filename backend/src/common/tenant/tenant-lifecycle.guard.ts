import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';
import { PLATFORM_ONLY_KEY } from '../decorators/platform-only.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestWithTenantContext } from './tenant-context';
import { assertTenantActive } from './tenant-lifecycle';

/**
 * Phase 5 W4 (SaaS Master Plan §11) — the merchant/admin-side half of the
 * tenant-lifecycle invariant. Once `TenantContextGuard` has resolved
 * `request.tenantContext` (or determined there is none), this guard
 * blocks the request when that tenant is `SUSPENDED` — before
 * `PermissionsGuard`'s RBAC check, before any handler runs. Registered
 * globally in `app.module.ts`, immediately after `TenantContextGuard` and
 * before `PermissionsGuard` — order matters, the same discipline those
 * two guards' own header comments already rely on.
 *
 * Deliberately mirrors `TenantContextGuard`'s own `@Public()`/
 * `@PlatformOnly()` skip exactly, so:
 *   - `/platform/*` is never touched here — a `SUPER_ADMIN` can still
 *     inspect/resume a suspended tenant (Master Plan §11), guaranteed
 *     structurally by this skip, not by a special case bolted on.
 *   - `@Public()` routes (health, auth, `@Public()` storefront reads) are
 *     unaffected.
 *   - A route where `TenantContextGuard` resolved NO context (e.g. a
 *     storefront shopper on `/cart/*` — no `TenantMembership` to resolve
 *     one from) is a no-op here: nothing to check. The SEPARATE
 *     storefront enforcement lives in `StorefrontTenantResolver` /
 *     `CheckoutService` instead — a shopper never takes any of
 *     `TenantContextGuard`'s context-resolving branches.
 *
 * A lifecycle gate, NOT a second authorization/RBAC system — it makes
 * exactly one decision (is the ALREADY-resolved tenant usable right now)
 * and never re-derives or second-guesses which tenant the request
 * belongs to.
 */
@Injectable()
export class TenantLifecycleGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isPlatformOnly = this.reflector.getAllAndOverride<boolean>(
      PLATFORM_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic || isPlatformOnly) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<RequestWithTenantContext>();
    const tenantId = request.tenantContext?.tenantId;
    if (!tenantId) {
      return true;
    }

    await assertTenantActive(
      this.prisma,
      tenantId,
      'This tenant is currently suspended',
    );
    return true;
  }
}
