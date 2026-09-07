import { NotFoundException } from '@nestjs/common';
import { assertObjectInTenant } from './object-auth';

/**
 * `assertObjectInTenant` — Phase 3 object-level authorization (SaaS Master
 * Plan §9 "object-level authorization mandatory"; independent audit P2
 * finding, closed here). Cross-tenant access must 404, never 403 — a 403
 * would confirm the resource exists in another tenant (an existence leak).
 */
describe('assertObjectInTenant', () => {
  it('a same-tenant resource passes through unchanged (no throw)', () => {
    const resource = { id: 'r1', tenantId: 't1', name: 'widget' };
    expect(() => assertObjectInTenant(resource, 't1')).not.toThrow();
    // The assertion signature narrows `resource` to non-null for the
    // caller — still the same object, untouched.
    expect(resource).toEqual({ id: 'r1', tenantId: 't1', name: 'widget' });
  });

  it('a mismatched-tenant resource throws NotFoundException (never 403 — no existence leak)', () => {
    const resource = { id: 'r1', tenantId: 't1', name: 'widget' };
    expect(() => assertObjectInTenant(resource, 't2')).toThrow(
      NotFoundException,
    );
  });

  it('a null resource throws NotFoundException', () => {
    expect(() => assertObjectInTenant(null, 't1')).toThrow(NotFoundException);
  });

  it('an undefined resource throws NotFoundException', () => {
    expect(() =>
      assertObjectInTenant(undefined as unknown as null, 't1'),
    ).toThrow(NotFoundException);
  });
});
