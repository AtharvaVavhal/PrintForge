import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { PLATFORM_ONLY_KEY } from '../decorators/platform-only.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { Permission } from '../../auth/permissions/permission';
import { RequestWithTenantContext } from './tenant-context';

export const SUPPORT_SESSION_HEADER = 'x-support-session-id';

/**
 * Phase 5 W6 (decisions P5-D4 / P5-D4A / P5-D8). Resolves `TenantContext`
 * for the SupportSession path — the platform-initiated counterpart of
 * `TenantContextGuard`'s membership-based resolution. Registered globally,
 * immediately BEFORE `TenantContextGuard` (see `app.module.ts`'s guard-
 * order doc comment), so that when this guard successfully resolves a
 * session, `TenantContextGuard` sees `request.tenantContext` already set
 * and skips its own resolution entirely (that guard's own header comment
 * explains why it must never override or reject what this guard resolved).
 *
 * Direction is one-way and non-negotiable (P5-D8): SupportSession ->
 * tenantId, never tenantId -> SupportSession. `identity.tenantId` is never
 * read from a request body, query string, or the ordinary `X-Active-Tenant`
 * header — only from the `SupportSession` row itself, looked up by the id
 * named in `X-Support-Session-Id` and re-validated against the DB on every
 * single request (no caching, no trusting a previously-validated result —
 * revocation and expiry must take effect immediately).
 *
 * Skips `@Public()` and `@PlatformOnly()` routes entirely, exactly like
 * `TenantContextGuard` — a support session must never grant `/platform/*`
 * access; `PlatformGuard`'s `platformRole === SUPER_ADMIN` check remains
 * the sole, unmodified authority there.
 *
 * No session-secret/token was introduced for this (see the W6
 * implementation report's "request authentication" section): the caller's
 * identity is already cryptographically verified by the existing, thin
 * access-token JWT (`JwtStrategy`, unchanged) before this guard ever runs;
 * a `SupportSession.id` is a plain, non-secret UUID exactly like every
 * other resource id in this system, and it is safe to name in a header
 * precisely because it authorizes nothing by itself — this guard requires
 * BOTH `session.createdByUserId === request.user.id` AND
 * `request.user.platformRole === SUPER_ADMIN` (re-checked live, not just at
 * session-creation time, so a since-demoted admin's still-open session
 * stops working immediately) before it will ever use the row.
 */
@Injectable()
export class SupportSessionContextGuard {
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

    const request = context.switchToHttp().getRequest<
      RequestWithTenantContext & {
        user?: AuthenticatedUser;
        headers: Record<string, string | string[] | undefined>;
      }
    >();

    const headerValue = request.headers[SUPPORT_SESSION_HEADER];
    const sessionId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!sessionId) {
      // No support session in play. Do not touch request.tenantContext —
      // TenantContextGuard resolves it normally, exactly as it does today.
      return true;
    }

    if (
      !request.user ||
      request.user.platformRole !== PlatformRole.SUPER_ADMIN
    ) {
      // Not a platform actor: this header cannot possibly name a session
      // that belongs to this caller (only a SUPER_ADMIN can ever create
      // one). Treat it as inert noise, not a spoof attempt — fall through
      // to the ordinary resolution path unaffected.
      return true;
    }

    const session = await this.prisma.supportSession.findUnique({
      where: { id: sessionId },
    });

    const isUsable =
      !!session &&
      session.createdByUserId === request.user.id &&
      session.revokedAt === null &&
      session.expiresAt.getTime() > Date.now();

    if (!isUsable) {
      // An explicitly-presented session identifier that does not resolve
      // to a usable session is treated exactly like an invalid
      // X-Active-Tenant value (TenantContextGuard's own "context-spoof
      // attempt... never fall back silently"): reject loudly, don't
      // quietly grant "no context". One generic message for every failure
      // branch (not found / wrong owner / revoked / expired) — the same
      // existence-leak reasoning as `assertObjectInTenant`'s 404-not-403
      // convention: a second SUPER_ADMIN probing another admin's session
      // id must not be able to distinguish "doesn't exist" from "exists
      // but isn't yours" from "exists and is revoked/expired".
      throw new ForbiddenException('Invalid support session');
    }

    request.tenantContext = {
      tenantId: session.tenantId,
      source: 'support-session',
      supportSession: {
        id: session.id,
        // Validated against the ratified PERMISSIONS catalogue at creation
        // time (support-session.service.ts) and never mutated afterward —
        // safe to widen from the stored `string[]` to `Permission[]` here.
        grantedPermissions: session.grantedPermissions as Permission[],
      },
    };
    return true;
  }
}
