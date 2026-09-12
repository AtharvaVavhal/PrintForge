import { readFileSync } from 'fs';
import { join } from 'path';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementGuard } from './entitlement.guard';
import type { TenantContext } from '../common/tenant/tenant-context';
import type { EntitlementResolution } from './entitlement.types';

/**
 * Phase 6 W4. Mirrors `permissions.guard.spec.ts`'s exact
 * `ExecutionContext`-mocking pattern. `EntitlementGuard.canActivate` is
 * async (it calls `EntitlementService.resolve`), so every assertion here
 * awaits/uses `.rejects`. `EntitlementService` itself is mocked — this file
 * proves the GUARD's own logic (metadata reading, tenant-context handling,
 * fail-closed behavior); real end-to-end composition with the real
 * `EntitlementService`, real Postgres, and the real guard chain is proven
 * in `test/e2e/entitlement-guard.e2e-spec.ts`.
 */
function makeContext(
  required: unknown,
  tenantContext: TenantContext | undefined,
): {
  context: ExecutionContext;
  reflector: Reflector;
  getAllAndOverride: jest.Mock;
} {
  // Captured as its own local so a test can assert on it directly
  // (`expect(getAllAndOverride)...`) without reading `.getAllAndOverride`
  // off a value statically typed as `Reflector` — a bare method reference
  // there trips `@typescript-eslint/unbound-method` even though nothing
  // here ever calls it unbound.
  const getAllAndOverride = jest.fn().mockReturnValue(required);
  const reflector = { getAllAndOverride } as unknown as Reflector;

  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ tenantContext }),
    }),
  } as unknown as ExecutionContext;

  return { context, reflector, getAllAndOverride };
}

function makeResolution(
  overrides: Partial<EntitlementResolution['features']> = {},
) {
  const features = {
    coupons: false,
    team_members: false,
    custom_domain: false,
    custom_storefront: false,
    custom_branding: false,
    advanced_analytics: false,
    api_access: false,
    ...overrides,
  };
  return { features, limits: {} } as unknown as EntitlementResolution;
}

describe('EntitlementGuard (Phase 6 W4)', () => {
  const tenantContext: TenantContext = {
    tenantId: 'tenant-a',
    source: 'membership-default',
    membership: { role: 'OWNER' },
  };

  // ─── A: no metadata ──────────────────────────────────────────────────────

  it('is a no-op when the route has no @RequireFeature metadata', async () => {
    const { context, reflector } = makeContext(undefined, tenantContext);
    const entitlementService = { resolve: jest.fn() };
    const guard = new EntitlementGuard(reflector, entitlementService as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(entitlementService.resolve).not.toHaveBeenCalled();
  });

  // ─── B: enabled feature ─────────────────────────────────────────────────

  it('allows when the resolved feature is enabled', async () => {
    const { context, reflector } = makeContext('coupons', tenantContext);
    const entitlementService = {
      resolve: jest.fn().mockResolvedValue(makeResolution({ coupons: true })),
    };
    const guard = new EntitlementGuard(reflector, entitlementService as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  // ─── C/D: disabled/missing feature ──────────────────────────────────────

  it('denies with 403 upgrade_required when the resolved feature is disabled', async () => {
    const { context, reflector } = makeContext('coupons', tenantContext);
    const entitlementService = {
      resolve: jest.fn().mockResolvedValue(makeResolution({ coupons: false })),
    };
    const guard = new EntitlementGuard(reflector, entitlementService as never);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'upgrade_required',
    );
  });

  it('denies identically when the feature is "missing" (deny-by-default from EntitlementService — indistinguishable to the guard from "disabled")', async () => {
    const { context, reflector } = makeContext('custom_domain', tenantContext);
    // A missing PlanFeature row resolves to `false` inside EntitlementService
    // (W2) — the guard has no separate "missing" branch, by design; it only
    // ever reads the final boolean.
    const entitlementService = {
      resolve: jest
        .fn()
        .mockResolvedValue(makeResolution({ custom_domain: false })),
    };
    const guard = new EntitlementGuard(reflector, entitlementService as never);

    await expect(guard.canActivate(context)).rejects.toThrow(
      'upgrade_required',
    );
  });

  // ─── E/F/G: overrides — the guard consumes W2's already-final result ───

  it("allows when an active override enables an otherwise-disabled plan feature (guard trusts EntitlementService's final result)", async () => {
    const { context, reflector } = makeContext('coupons', tenantContext);
    // Simulates: plan says false, an active override replaced it with true —
    // EntitlementService already applied that; the guard just sees `true`.
    const entitlementService = {
      resolve: jest.fn().mockResolvedValue(makeResolution({ coupons: true })),
    };
    const guard = new EntitlementGuard(reflector, entitlementService as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('denies when an active override disables an otherwise-enabled plan feature', async () => {
    const { context, reflector } = makeContext('coupons', tenantContext);
    const entitlementService = {
      resolve: jest.fn().mockResolvedValue(makeResolution({ coupons: false })),
    };
    const guard = new EntitlementGuard(reflector, entitlementService as never);

    await expect(guard.canActivate(context)).rejects.toThrow(
      'upgrade_required',
    );
  });

  it('a revoked override never reaches the guard as a factor — EntitlementService already excludes it, so the guard sees only the plan value', async () => {
    const { context, reflector } = makeContext('coupons', tenantContext);
    // Simulates a revoked override existing in the DB but EXCLUDED by W2 —
    // the plan's own value (true) is what EntitlementService returns.
    const entitlementService = {
      resolve: jest.fn().mockResolvedValue(makeResolution({ coupons: true })),
    };
    const guard = new EntitlementGuard(reflector, entitlementService as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  // ─── H: correct tenant passed through ───────────────────────────────────

  it('resolves entitlements using the exact tenantId from the server-derived tenant context', async () => {
    const { context, reflector } = makeContext('coupons', {
      tenantId: 'tenant-xyz',
      source: 'membership-default',
      membership: { role: 'OWNER' },
    });
    const entitlementService = {
      resolve: jest.fn().mockResolvedValue(makeResolution({ coupons: true })),
    };
    const guard = new EntitlementGuard(reflector, entitlementService as never);

    await guard.canActivate(context);

    expect(entitlementService.resolve).toHaveBeenCalledWith('tenant-xyz');
  });

  it('treats a support-session-derived tenant context identically — same tenantId, no special-casing, no second tenant-resolution mechanism', async () => {
    const { context, reflector } = makeContext('coupons', {
      tenantId: 'tenant-support',
      source: 'support-session',
      supportSession: { id: 's1', grantedPermissions: ['dashboard:read'] },
    });
    const entitlementService = {
      resolve: jest.fn().mockResolvedValue(makeResolution({ coupons: true })),
    };
    const guard = new EntitlementGuard(reflector, entitlementService as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(entitlementService.resolve).toHaveBeenCalledWith('tenant-support');
  });

  // ─── I: missing tenant context → fail closed ────────────────────────────

  it('denies (fail closed) when a feature is required but there is no tenant context — never calls EntitlementService', async () => {
    const { context, reflector } = makeContext('coupons', undefined);
    const entitlementService = { resolve: jest.fn() };
    const guard = new EntitlementGuard(reflector, entitlementService as never);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(entitlementService.resolve).not.toHaveBeenCalled();
  });

  // ─── J: EntitlementService resolution failure → fail closed ─────────────

  it('denies (fail closed) when EntitlementService.resolve() throws — never allows on error, never leaks the underlying error', async () => {
    const { context, reflector } = makeContext('coupons', tenantContext);
    const entitlementService = {
      resolve: jest
        .fn()
        .mockRejectedValue(new Error('connection reset by peer')),
    };
    const guard = new EntitlementGuard(reflector, entitlementService as never);

    const rejection = guard.canActivate(context);
    await expect(rejection).rejects.toThrow(ForbiddenException);
    await expect(rejection).rejects.toThrow('upgrade_required');
    await expect(rejection).rejects.not.toThrow('connection reset by peer');
  });

  // ─── K: single-feature-per-route design (documented, not invented) ─────

  it('reads exactly one feature key from metadata — no AND/OR combinator exists (single-feature-per-route by design, matching @RequirePermission)', async () => {
    const { context, reflector, getAllAndOverride } = makeContext(
      'coupons',
      tenantContext,
    );
    const entitlementService = {
      resolve: jest.fn().mockResolvedValue(makeResolution({ coupons: true })),
    };
    const guard = new EntitlementGuard(reflector, entitlementService as never);

    await guard.canActivate(context);

    // getAllAndOverride was called with the single metadata key, exactly
    // once per canActivate — the guard has no loop, no array-of-features
    // handling anywhere.
    expect(getAllAndOverride).toHaveBeenCalledTimes(1);
  });

  // ─── N: support_sessions is never a valid feature ───────────────────────

  it('fails closed if metadata somehow carried "support_sessions" — it is not in the catalogue and is never accepted', async () => {
    const { context, reflector } = makeContext(
      'support_sessions',
      tenantContext,
    );
    const entitlementService = { resolve: jest.fn() };
    const guard = new EntitlementGuard(reflector, entitlementService as never);

    await expect(guard.canActivate(context)).rejects.toThrow(
      'upgrade_required',
    );
    // Denied before ever reaching EntitlementService — an unrecognized key
    // is a metadata-validation failure, not a resolvable feature question.
    expect(entitlementService.resolve).not.toHaveBeenCalled();
  });

  it('fails closed on any unrecognized string value, not just support_sessions', async () => {
    const { context, reflector } = makeContext(
      'not_a_real_feature',
      tenantContext,
    );
    const entitlementService = { resolve: jest.fn() };
    const guard = new EntitlementGuard(reflector, entitlementService as never);

    await expect(guard.canActivate(context)).rejects.toThrow(
      'upgrade_required',
    );
  });

  // ─── L/M: no Usage/limit interaction (static source scan) ──────────────

  it('the guard source never references UsageService, reserve, decrement, PlanLimit, or assertLimit — W4 owns none of that', () => {
    const source = readFileSync(
      join(__dirname, 'entitlement.guard.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/UsageService/);
    expect(source).not.toMatch(/\breserve\(/);
    expect(source).not.toMatch(/\bdecrement\(/);
    expect(source).not.toMatch(/PlanLimit/);
    expect(source).not.toMatch(/assertLimit/);
  });

  it('the guard source never queries Plan/PlanFeature/Subscription/TenantEntitlementOverride directly — only EntitlementService.resolve()', () => {
    const source = readFileSync(
      join(__dirname, 'entitlement.guard.ts'),
      'utf8',
    );
    expect(source).not.toMatch(
      /prisma\.(plan|planFeature|subscription|tenantEntitlementOverride)/i,
    );
  });
});
