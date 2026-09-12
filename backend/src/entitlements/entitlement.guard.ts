import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithTenantContext } from '../common/tenant/tenant-context';
import { isFeatureKey } from '../platform/platform-plans/catalogue.constants';
import { EntitlementService } from './entitlement.service';
import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';

/** The single, fixed, machine-readable denial signal every feature-gated
 * 403 carries in `error.message` (`HttpExceptionFilter`'s existing
 * `extractMessage` already surfaces a string `HttpException` message
 * verbatim — no filter change needed to satisfy the ratified "403 +
 * upgrade_required" contract). Deliberately generic: never includes the
 * feature key, plan name, tenant id, or any other detail (§19 — nothing
 * beyond this fixed string reaches the client on any denial path, expected
 * or not). */
const UPGRADE_REQUIRED_MESSAGE = 'upgrade_required';

/**
 * Phase 6 W4 — feature entitlement enforcement. Registered globally via
 * `APP_GUARD` in `app.module.ts`, positioned AFTER `PermissionsGuard`
 * (TenantContextGuard -> TenantLifecycleGuard -> PermissionsGuard ->
 * EntitlementGuard) — the exact same registration mechanism every other
 * guard in this pipeline already uses (`ThrottlerGuard`, `JwtAuthGuard`,
 * `SupportSessionContextGuard`, `TenantContextGuard`, `TenantLifecycleGuard`,
 * `PermissionsGuard`, `PlatformGuard` — see that file's own header
 * comment), not a new per-controller `@UseGuards()` mechanism. Because a
 * permission failure already throws inside `PermissionsGuard` and never
 * reaches this guard, "permission denied" and "feature disabled" can never
 * be confused or converted into one another — they are enforced by two
 * separate guards running in a fixed order, not by one guard doing both.
 *
 * Transparent by design: with no `@RequireFeature(...)` metadata on the
 * route, this guard is a pure no-op `return true` — behaviorally identical
 * to not being registered at all for that route. This is what makes global
 * registration safe here (§9/§23 of the W4 authorization): every existing
 * endpoint's authorization behavior is unchanged, proven in
 * `entitlement-guard.e2e-spec.ts`'s own regression test against a real,
 * pre-existing, unmodified route.
 *
 * **Never duplicates W2's resolution.** This file contains no query
 * against `Plan`/`PlanFeature`/`Subscription`/`TenantEntitlementOverride`
 * at all — it calls `EntitlementService.resolve(tenantId)` exactly once
 * and reads the single feature key it needs from the result. `Plan ->
 * PlanFeature -> Subscription -> Override -> effective entitlement`
 * remains centralized in W2, unchanged.
 *
 * **Tenant context.** Reads `request.tenantContext` — the SAME
 * server-derived value `PermissionsGuard`/`TenantLifecycleGuard` already
 * consume, populated earlier in the SAME guard chain by
 * `SupportSessionContextGuard`/`TenantContextGuard`. Never reads
 * `req.body`/`req.query`/`req.params`/a custom header directly — there is
 * no code path here that could accept or launder a client-supplied tenant
 * id. A `source: 'support-session'` context is treated identically to an
 * ordinary membership context (both carry a real, server-resolved
 * `tenantId`) — entitlements are a property of the TENANT being acted on,
 * not of who is acting on it; no second tenant-resolution mechanism is
 * introduced for that case.
 *
 * **Fail-closed, every path**: no tenant context, an unrecognized feature
 * key value, a disabled/missing feature, or a thrown error from
 * `EntitlementService.resolve()` itself (e.g. a transient DB failure) all
 * deny with the same 403 `upgrade_required` — never allow-on-error, never
 * silent success, never a 401/404/500 substitute (those remain whatever an
 * earlier guard in the chain would have already produced, before this
 * guard ever runs).
 */
@Injectable()
export class EntitlementGuard {
  private readonly logger = new Logger(EntitlementGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementService: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<unknown>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredFeature === undefined) {
      return true;
    }

    // Runtime defense: `@RequireFeature` is TS-typed to accept only a
    // `FeatureKey`, but `Reflector` metadata is untyped at runtime — never
    // trust it blindly. An unrecognized value fails closed exactly like a
    // disabled feature, never treated as "no requirement"/allowed.
    if (typeof requiredFeature !== 'string' || !isFeatureKey(requiredFeature)) {
      this.logger.warn(
        `EntitlementGuard: route declared an unrecognized @RequireFeature value (ignored, denied)`,
      );
      throw new ForbiddenException(UPGRADE_REQUIRED_MESSAGE);
    }

    const { tenantContext } = context
      .switchToHttp()
      .getRequest<RequestWithTenantContext>();

    if (!tenantContext) {
      throw new ForbiddenException('No active tenant context for this request');
    }

    let enabled: boolean;
    try {
      const resolution = await this.entitlementService.resolve(
        tenantContext.tenantId,
      );
      enabled = resolution.features[requiredFeature];
    } catch (err) {
      // Fail closed: a resolution failure is never treated as granted, and
      // nothing about the underlying error (DB error, Prisma error, SQL
      // detail) is ever exposed to the client — same generic message as
      // every other denial path.
      this.logger.error(
        `EntitlementGuard: entitlement resolution failed for tenant — denying`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new ForbiddenException(UPGRADE_REQUIRED_MESSAGE);
    }

    if (!enabled) {
      throw new ForbiddenException(UPGRADE_REQUIRED_MESSAGE);
    }

    return true;
  }
}
