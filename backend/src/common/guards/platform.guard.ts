import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformRole } from '@prisma/client';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { PLATFORM_ONLY_KEY } from '../decorators/platform-only.decorator';

/**
 * Platform-scope check for `@PlatformOnly()` routes: admits a request only when
 * the authenticated User carries `platformRole === SUPER_ADMIN`
 * (SaaS Master Plan §8; decision P2-D1, ratified by G-12 — docs/saas/DECISIONS.md
 * v1.2).
 *
 * Independent of RolesGuard and of any TenantMembership / permission
 * (frozen SaaS invariant 4). A SUPER_ADMIN has NO tenant authority through this
 * guard — tenant access still requires a TenantMembership, enforced by Phase 3's
 * tenant-aware layer (not built yet; D6 deferred, decision P2-D9).
 *
 * Registered globally in AppModule alongside RolesGuard. Phase 2a: the guard is
 * a no-op for every request because NO route is decorated with `@PlatformOnly()`
 * yet — the platform console is Phase 5. It is delivered live so Phase 5 only
 * has to add the decorator.
 */
@Injectable()
export class PlatformGuard {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPlatformOnly = this.reflector.getAllAndOverride<boolean>(
      PLATFORM_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!isPlatformOnly) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!user || user.platformRole !== PlatformRole.SUPER_ADMIN) {
      throw new ForbiddenException('Platform super-admin access required');
    }

    return true;
  }
}
