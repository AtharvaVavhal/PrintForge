import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  SUPPORT_SESSION_HEADER,
  SupportSessionContextGuard,
} from './support-session-context.guard';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { PrismaService } from '../database/prisma.service';

/**
 * Phase 5 W6. Mirrors `tenant-context.guard.spec.ts`'s fake-ExecutionContext
 * mocking convention exactly.
 */
function makeContext(options: {
  isPublic?: boolean;
  isPlatformOnly?: boolean;
  user?: Partial<AuthenticatedUser>;
  headers?: Record<string, string>;
}) {
  const reflector = {
    getAllAndOverride: jest
      .fn()
      .mockImplementation((key: string) =>
        key === 'isPublic' ? options.isPublic : options.isPlatformOnly,
      ),
  } as unknown as Reflector;

  const request: Record<string, unknown> = {
    user: options.user,
    headers: options.headers ?? {},
  };

  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, reflector, request };
}

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 1000);

describe('SupportSessionContextGuard (Phase 5 W6 / P5-D8)', () => {
  function makePrisma(session: unknown) {
    return {
      supportSession: { findUnique: jest.fn().mockResolvedValue(session) },
    } as unknown as PrismaService;
  }

  it('skips @Public() routes entirely, even with a session header present', async () => {
    const { context, reflector, request } = makeContext({
      isPublic: true,
      headers: { [SUPPORT_SESSION_HEADER]: 'session-1' },
    });
    const guard = new SupportSessionContextGuard(reflector, makePrisma(null));
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.tenantContext).toBeUndefined();
  });

  it('skips platform-only routes entirely — a support session must never grant /platform/* access', async () => {
    const { context, reflector, request } = makeContext({
      isPlatformOnly: true,
      user: { id: 'admin-1', platformRole: 'SUPER_ADMIN' },
      headers: { [SUPPORT_SESSION_HEADER]: 'session-1' },
    });
    const guard = new SupportSessionContextGuard(reflector, makePrisma(null));
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.tenantContext).toBeUndefined();
  });

  it('is a no-op when no X-Support-Session-Id header is present', async () => {
    const { context, reflector, request } = makeContext({
      user: { id: 'admin-1', platformRole: 'SUPER_ADMIN' },
    });
    const prisma = makePrisma(null);
    const guard = new SupportSessionContextGuard(reflector, prisma);
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.tenantContext).toBeUndefined();
    // Reads a jest.fn() off a PrismaService-typed mock purely to assert it
    // was never invoked — never called as a method, so there's no real
    // unbound-`this` risk (same rationale products.controller.spec.ts's
    // own disable/enable pair already documents for this exact pattern).
    /* eslint-disable @typescript-eslint/unbound-method */
    expect(prisma.supportSession.findUnique).not.toHaveBeenCalled();
    /* eslint-enable @typescript-eslint/unbound-method */
  });

  it('treats the header as inert noise for a non-SUPER_ADMIN caller — no lookup, no context, no throw', async () => {
    const { context, reflector, request } = makeContext({
      user: { id: 'user-1', platformRole: null },
      headers: { [SUPPORT_SESSION_HEADER]: 'session-1' },
    });
    const prisma = makePrisma(null);
    const guard = new SupportSessionContextGuard(reflector, prisma);
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.tenantContext).toBeUndefined();
    /* eslint-disable @typescript-eslint/unbound-method */
    expect(prisma.supportSession.findUnique).not.toHaveBeenCalled();
    /* eslint-enable @typescript-eslint/unbound-method */
  });

  it('treats the header as inert noise for an unauthenticated request', async () => {
    const { context, reflector, request } = makeContext({
      headers: { [SUPPORT_SESSION_HEADER]: 'session-1' },
    });
    const guard = new SupportSessionContextGuard(reflector, makePrisma(null));
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.tenantContext).toBeUndefined();
  });

  it('rejects with a generic 403 when the named session does not exist', async () => {
    const { context, reflector } = makeContext({
      user: { id: 'admin-1', platformRole: 'SUPER_ADMIN' },
      headers: { [SUPPORT_SESSION_HEADER]: 'nonexistent' },
    });
    const guard = new SupportSessionContextGuard(reflector, makePrisma(null));
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects with the SAME generic message when the session belongs to a different SUPER_ADMIN (no existence leak)', async () => {
    const { context, reflector } = makeContext({
      user: { id: 'admin-2', platformRole: 'SUPER_ADMIN' },
      headers: { [SUPPORT_SESSION_HEADER]: 'session-1' },
    });
    const guard = new SupportSessionContextGuard(
      reflector,
      makePrisma({
        id: 'session-1',
        tenantId: 'tenant-a',
        createdByUserId: 'admin-1',
        revokedAt: null,
        expiresAt: FUTURE,
        grantedPermissions: ['orders:read'],
      }),
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Invalid support session',
    );
  });

  it('rejects a revoked session', async () => {
    const { context, reflector } = makeContext({
      user: { id: 'admin-1', platformRole: 'SUPER_ADMIN' },
      headers: { [SUPPORT_SESSION_HEADER]: 'session-1' },
    });
    const guard = new SupportSessionContextGuard(
      reflector,
      makePrisma({
        id: 'session-1',
        tenantId: 'tenant-a',
        createdByUserId: 'admin-1',
        revokedAt: new Date(),
        expiresAt: FUTURE,
        grantedPermissions: ['orders:read'],
      }),
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects an expired session', async () => {
    const { context, reflector } = makeContext({
      user: { id: 'admin-1', platformRole: 'SUPER_ADMIN' },
      headers: { [SUPPORT_SESSION_HEADER]: 'session-1' },
    });
    const guard = new SupportSessionContextGuard(
      reflector,
      makePrisma({
        id: 'session-1',
        tenantId: 'tenant-a',
        createdByUserId: 'admin-1',
        revokedAt: null,
        expiresAt: PAST,
        grantedPermissions: ['orders:read'],
      }),
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('a since-demoted admin (platformRole no longer SUPER_ADMIN) is treated as inert noise even though their own session still exists and is valid', async () => {
    const { context, reflector, request } = makeContext({
      user: { id: 'admin-1', platformRole: null },
      headers: { [SUPPORT_SESSION_HEADER]: 'session-1' },
    });
    const prisma = makePrisma({
      id: 'session-1',
      tenantId: 'tenant-a',
      createdByUserId: 'admin-1',
      revokedAt: null,
      expiresAt: FUTURE,
      grantedPermissions: ['orders:read'],
    });
    const guard = new SupportSessionContextGuard(reflector, prisma);
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.tenantContext).toBeUndefined();
    /* eslint-disable @typescript-eslint/unbound-method */
    expect(prisma.supportSession.findUnique).not.toHaveBeenCalled();
    /* eslint-enable @typescript-eslint/unbound-method */
  });

  it('resolves a valid, owned, unrevoked, unexpired session into a support-session TenantContext', async () => {
    const { context, reflector, request } = makeContext({
      user: { id: 'admin-1', platformRole: 'SUPER_ADMIN' },
      headers: { [SUPPORT_SESSION_HEADER]: 'session-1' },
    });
    const guard = new SupportSessionContextGuard(
      reflector,
      makePrisma({
        id: 'session-1',
        tenantId: 'tenant-a',
        createdByUserId: 'admin-1',
        revokedAt: null,
        expiresAt: FUTURE,
        grantedPermissions: ['orders:read', 'customers:read'],
      }),
    );
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.tenantContext).toEqual({
      tenantId: 'tenant-a',
      source: 'support-session',
      supportSession: {
        id: 'session-1',
        grantedPermissions: ['orders:read', 'customers:read'],
      },
    });
  });
});
