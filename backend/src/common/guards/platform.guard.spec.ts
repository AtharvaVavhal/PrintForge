import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformGuard } from './platform.guard';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * PlatformGuard — SaaS Phase 2a (Master Plan §8; decision P2-D1, gate G-12;
 * docs/saas/PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §C.9 AC-P2-10 / AC-P2-11).
 *
 * The guard is a FOUNDATION capability: it only acts on @PlatformOnly() routes,
 * and Phase 2a decorates NO route with it. These tests exercise the guard's
 * canActivate() directly with a fake ExecutionContext, and assert the codebase
 * has not accidentally activated it anywhere.
 */

function makeContext(
  isPlatformOnly: boolean | undefined,
  user: Partial<AuthenticatedUser> | undefined,
): { context: ExecutionContext; reflector: Reflector } {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPlatformOnly),
  } as unknown as Reflector;

  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

describe('PlatformGuard (Phase 2a)', () => {
  const superAdmin: Partial<AuthenticatedUser> = {
    id: 'u1',
    email: 'sa@example.test',
    role: 'CUSTOMER',
    platformRole: 'SUPER_ADMIN',
    memberships: [],
  };
  const plainUser: Partial<AuthenticatedUser> = {
    id: 'u2',
    email: 'u@example.test',
    role: 'CUSTOMER',
    platformRole: null,
    memberships: [],
  };
  const tenantAdmin: Partial<AuthenticatedUser> = {
    id: 'u3',
    email: 'ta@example.test',
    role: 'ADMIN', // legacy admin AND has a tenant OWNER membership...
    platformRole: null, // ...but is NOT a platform super-admin
    memberships: [{ tenantId: 't1', role: 'OWNER' }],
  };

  it('is a no-op when the route is NOT @PlatformOnly() (returns true, ignores user)', () => {
    const { context, reflector } = makeContext(undefined, undefined);
    expect(new PlatformGuard(reflector).canActivate(context)).toBe(true);

    const { context: c2, reflector: r2 } = makeContext(false, plainUser);
    expect(new PlatformGuard(r2).canActivate(c2)).toBe(true);
  });

  it('AC-P2-10: admits a SUPER_ADMIN on a @PlatformOnly() route', () => {
    const { context, reflector } = makeContext(true, superAdmin);
    expect(new PlatformGuard(reflector).canActivate(context)).toBe(true);
  });

  it('AC-P2-10: denies (403) a user whose platformRole is null on a @PlatformOnly() route', () => {
    const { context, reflector } = makeContext(true, plainUser);
    expect(() => new PlatformGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('AC-P2-10: denies (403) when there is no authenticated user', () => {
    const { context, reflector } = makeContext(true, undefined);
    expect(() => new PlatformGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('AC-P2-11: independence from RolesGuard — a legacy ADMIN with an OWNER membership but platformRole=null is denied', () => {
    const { context, reflector } = makeContext(true, tenantAdmin);
    expect(() => new PlatformGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('denies a non-SUPER_ADMIN platformRole value (defensive)', () => {
    const { context, reflector } = makeContext(true, {
      ...plainUser,
      platformRole: 'SOMETHING_ELSE' as unknown as null,
    });
    expect(() => new PlatformGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('dormant: NO route in src/ actually applies @PlatformOnly() (comments/docs excluded)', () => {
    const srcDir = join(__dirname, '..', '..');
    const stripComments = (s: string): string =>
      s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(p);
        } else if (entry.name.endsWith('.ts')) {
          const code = stripComments(readFileSync(p, 'utf8'));
          // the decorator factory itself is `export const PlatformOnly = ...`;
          // an actual application reads `@PlatformOnly(`
          if (
            /@PlatformOnly\s*\(/.test(code) &&
            !p.endsWith('platform.guard.spec.ts')
          ) {
            hits.push(p);
          }
        }
      }
    };
    walk(srcDir);
    expect(hits).toEqual([]);
  });
});
