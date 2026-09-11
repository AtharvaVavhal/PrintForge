import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import type { Permission } from './permission';
import type { TenantContext } from '../../common/tenant/tenant-context';

/**
 * PermissionsGuard — Phase 3 (decisions P2-D9, G-13, G-20;
 * docs/saas/DECISIONS.md). Replaces `RolesGuard`. Mirrors
 * `platform.guard.spec.ts`'s ExecutionContext-mocking pattern.
 */
function makeContext(
  required: Permission | undefined,
  tenantContext: TenantContext | undefined,
): { context: ExecutionContext; reflector: Reflector } {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;

  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ tenantContext }),
    }),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

describe('PermissionsGuard (Phase 3)', () => {
  it('is a no-op when the route has no @RequirePermission metadata', () => {
    const { context, reflector } = makeContext(undefined, undefined);
    expect(new PermissionsGuard(reflector).canActivate(context)).toBe(true);
  });

  it('denies (403) when a permission is required but there is no tenant context', () => {
    const { context, reflector } = makeContext('orders:read', undefined);
    expect(() => new PermissionsGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('denies (403) when there is tenant context but no membership on it', () => {
    const { context, reflector } = makeContext('orders:read', {
      tenantId: 't1',
      source: 'membership-default',
    });
    expect(() => new PermissionsGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('admits an OWNER for any ratified permission', () => {
    const { context, reflector } = makeContext('members:manage', {
      tenantId: 't1',
      source: 'membership-default',
      membership: { role: 'OWNER' },
    });
    expect(new PermissionsGuard(reflector).canActivate(context)).toBe(true);
  });

  it('VIEWER cannot transition an order (deny by default)', () => {
    const { context, reflector } = makeContext('orders:transition', {
      tenantId: 't1',
      source: 'membership-default',
      membership: { role: 'VIEWER' },
    });
    expect(() => new PermissionsGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('STAFF cannot manage members', () => {
    const { context, reflector } = makeContext('members:manage', {
      tenantId: 't1',
      source: 'membership-default',
      membership: { role: 'STAFF' },
    });
    expect(() => new PermissionsGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('ADMIN cannot manage members or the payment account (OWNER-reserved)', () => {
    for (const permission of [
      'members:manage',
      'payment-account:manage',
    ] as Permission[]) {
      const { context, reflector } = makeContext(permission, {
        tenantId: 't1',
        source: 'membership-default',
        membership: { role: 'ADMIN' },
      });
      expect(() =>
        new PermissionsGuard(reflector).canActivate(context),
      ).toThrow(ForbiddenException);
    }
  });

  it('a SUPER_ADMIN with no TenantMembership is denied exactly like any other user with no membership (frozen invariant 4)', () => {
    // SUPER_ADMIN is a PlatformRole, never a TenantContext.membership.role —
    // there is structurally no way for it to appear here. This test
    // documents that PermissionsGuard's only path is "no membership -> 403",
    // which is exactly what a SUPER_ADMIN with no tenant membership gets.
    const { context, reflector } = makeContext('dashboard:read', undefined);
    expect(() => new PermissionsGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  describe('support-session permission ceiling (Phase 5 W6, decision P5-D8)', () => {
    it('admits a support session scoped to exactly the required permission', () => {
      const { context, reflector } = makeContext('orders:read', {
        tenantId: 't1',
        source: 'support-session',
        supportSession: { id: 's1', grantedPermissions: ['orders:read'] },
      });
      expect(new PermissionsGuard(reflector).canActivate(context)).toBe(true);
    });

    it('denies a support session NOT scoped to the required permission', () => {
      const { context, reflector } = makeContext('orders:read', {
        tenantId: 't1',
        source: 'support-session',
        supportSession: { id: 's1', grantedPermissions: ['customers:read'] },
      });
      expect(() =>
        new PermissionsGuard(reflector).canActivate(context),
      ).toThrow(ForbiddenException);
    });

    it('a scope granting orders:read does NOT also grant orders:transition (ceiling, not a role)', () => {
      const { context, reflector } = makeContext('orders:transition', {
        tenantId: 't1',
        source: 'support-session',
        supportSession: { id: 's1', grantedPermissions: ['orders:read'] },
      });
      expect(() =>
        new PermissionsGuard(reflector).canActivate(context),
      ).toThrow(ForbiddenException);
    });

    it('a support-session context is never combined with a role-based membership check, even if (incorrectly) both were present', () => {
      // Defensive: source alone decides which branch runs. A support
      // session never has a real membership in practice (the guard that
      // constructs it never sets one), but this pins that `source` — not
      // the mere presence of `membership` — is what selects the ceiling
      // branch, so a future bug can't silently fall through to `can()`.
      const { context, reflector } = makeContext('members:manage', {
        tenantId: 't1',
        source: 'support-session',
        membership: { role: 'OWNER' },
        supportSession: { id: 's1', grantedPermissions: ['orders:read'] },
      });
      expect(() =>
        new PermissionsGuard(reflector).canActivate(context),
      ).toThrow(ForbiddenException);
    });

    it('denies when the tenant context claims support-session source but carries no supportSession payload (defensive fail-closed)', () => {
      const { context, reflector } = makeContext('orders:read', {
        tenantId: 't1',
        source: 'support-session',
      });
      expect(() =>
        new PermissionsGuard(reflector).canActivate(context),
      ).toThrow(ForbiddenException);
    });
  });
});
