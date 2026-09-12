import {
  can,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type Permission,
} from './permission';

/**
 * Permission catalogue — ratified G-13 (docs/saas/DECISIONS.md, 2026-09-07)
 * plus P7-D2 Part A (2026-09-12 — adds `billing:manage`, the 14th
 * permission). These tests pin the exact ratified catalogue and role map
 * so a future change requires touching this file deliberately, not by
 * accident.
 */
describe('permission catalogue (G-13, extended by P7-D2 Part A)', () => {
  it('has exactly the 14 ratified permission strings', () => {
    expect([...PERMISSIONS].sort()).toEqual(
      [
        'dashboard:read',
        'orders:read',
        'orders:transition',
        'customers:read',
        'reviews:moderate',
        'coupons:read',
        'coupons:write',
        'settings:read',
        'settings:write',
        'products:read',
        'products:write',
        'members:manage',
        'payment-account:manage',
        'billing:manage',
      ].sort(),
    );
  });

  it('OWNER holds all 14 permissions', () => {
    expect(ROLE_PERMISSIONS.OWNER.size).toBe(14);
    for (const p of PERMISSIONS) {
      expect(ROLE_PERMISSIONS.OWNER.has(p)).toBe(true);
    }
  });

  it('ADMIN holds every permission except members:manage and payment-account:manage (billing:manage included, P7-D2 Part A)', () => {
    expect(ROLE_PERMISSIONS.ADMIN.has('members:manage')).toBe(false);
    expect(ROLE_PERMISSIONS.ADMIN.has('payment-account:manage')).toBe(false);
    expect(ROLE_PERMISSIONS.ADMIN.has('billing:manage')).toBe(true);
    expect(ROLE_PERMISSIONS.ADMIN.size).toBe(12);
  });

  it('STAFF and VIEWER do not hold billing:manage (P7-D2 Part A — admin-tier only)', () => {
    expect(ROLE_PERMISSIONS.STAFF.has('billing:manage')).toBe(false);
    expect(ROLE_PERMISSIONS.VIEWER.has('billing:manage')).toBe(false);
  });

  it('STAFF holds the ratified operational set only', () => {
    const expected: Permission[] = [
      'dashboard:read',
      'orders:read',
      'orders:transition',
      'customers:read',
      'reviews:moderate',
      'coupons:read',
      'settings:read',
      'products:read',
      'products:write',
    ];
    expect([...ROLE_PERMISSIONS.STAFF].sort()).toEqual(expected.sort());
    expect(ROLE_PERMISSIONS.STAFF.has('coupons:write')).toBe(false);
    expect(ROLE_PERMISSIONS.STAFF.has('settings:write')).toBe(false);
    expect(ROLE_PERMISSIONS.STAFF.has('members:manage')).toBe(false);
  });

  it('VIEWER holds read-only permissions exclusively', () => {
    for (const p of ROLE_PERMISSIONS.VIEWER) {
      expect(p.endsWith(':read')).toBe(true);
    }
    expect(ROLE_PERMISSIONS.VIEWER.size).toBe(6);
    expect(ROLE_PERMISSIONS.VIEWER.has('orders:transition')).toBe(false);
    expect(ROLE_PERMISSIONS.VIEWER.has('reviews:moderate')).toBe(false);
    expect(ROLE_PERMISSIONS.VIEWER.has('products:write')).toBe(false);
  });

  describe('can() — deny-by-default', () => {
    it('denies when role is null or undefined (no active membership)', () => {
      expect(can(null, 'dashboard:read')).toBe(false);
      expect(can(undefined, 'dashboard:read')).toBe(false);
    });

    it('OWNER can do everything', () => {
      for (const p of PERMISSIONS) {
        expect(can('OWNER', p)).toBe(true);
      }
    });

    it('VIEWER cannot transition an order', () => {
      expect(can('VIEWER', 'orders:transition')).toBe(false);
    });

    it('STAFF cannot manage members', () => {
      expect(can('STAFF', 'members:manage')).toBe(false);
    });

    it('STAFF cannot write settings or coupons', () => {
      expect(can('STAFF', 'settings:write')).toBe(false);
      expect(can('STAFF', 'coupons:write')).toBe(false);
    });

    it('ADMIN cannot manage members or the payment account', () => {
      expect(can('ADMIN', 'members:manage')).toBe(false);
      expect(can('ADMIN', 'payment-account:manage')).toBe(false);
    });

    it('ADMIN can transition orders and write products/settings/coupons', () => {
      expect(can('ADMIN', 'orders:transition')).toBe(true);
      expect(can('ADMIN', 'products:write')).toBe(true);
      expect(can('ADMIN', 'settings:write')).toBe(true);
      expect(can('ADMIN', 'coupons:write')).toBe(true);
    });
  });

  it('SUPER_ADMIN (a PlatformRole, not a TenantRole) has no entry in this map at all', () => {
    // TypeScript itself enforces this: ROLE_PERMISSIONS is keyed by TenantRole,
    // which does not include 'SUPER_ADMIN'. This test documents the invariant
    // (frozen SaaS invariant 4) rather than exercising new runtime behavior.
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      ['ADMIN', 'OWNER', 'STAFF', 'VIEWER'].sort(),
    );
  });
});
