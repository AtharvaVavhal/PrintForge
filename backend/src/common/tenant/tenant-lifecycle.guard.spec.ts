import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantLifecycleGuard } from './tenant-lifecycle.guard';

/**
 * Phase 5 W4. Same fake-`ExecutionContext` mocking convention as
 * `platform.guard.spec.ts` — exercises `canActivate()` directly.
 */
describe('TenantLifecycleGuard', () => {
  function makeContext(
    isPublic: boolean | undefined,
    isPlatformOnly: boolean | undefined,
    tenantContext: { tenantId: string } | undefined,
  ): { context: ExecutionContext; reflector: Reflector } {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(isPublic)
        .mockReturnValueOnce(isPlatformOnly),
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

  function makePrisma(tenant: { status: string } | null) {
    return {
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
    };
  }

  it('is a no-op on a @Public() route regardless of tenant status', async () => {
    const { context, reflector } = makeContext(true, undefined, {
      tenantId: 'tenant-a',
    });
    const guard = new TenantLifecycleGuard(
      reflector,
      makePrisma({ status: 'SUSPENDED' }) as never,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('is a no-op on a platform-only route regardless of tenant status — SUPER_ADMIN must never be blocked here', async () => {
    const { context, reflector } = makeContext(undefined, true, {
      tenantId: 'tenant-a',
    });
    const guard = new TenantLifecycleGuard(
      reflector,
      makePrisma({ status: 'SUSPENDED' }) as never,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('is a no-op when no tenantContext was resolved (e.g. a storefront shopper) — nothing to check here', async () => {
    const { context, reflector } = makeContext(undefined, undefined, undefined);
    const prisma = makePrisma({ status: 'SUSPENDED' });
    const guard = new TenantLifecycleGuard(reflector, prisma as never);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('allows an ACTIVE tenant context through', async () => {
    const { context, reflector } = makeContext(undefined, undefined, {
      tenantId: 'tenant-a',
    });
    const guard = new TenantLifecycleGuard(
      reflector,
      makePrisma({ status: 'ACTIVE' }) as never,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('blocks a SUSPENDED tenant context with ForbiddenException', async () => {
    const { context, reflector } = makeContext(undefined, undefined, {
      tenantId: 'tenant-a',
    });
    const guard = new TenantLifecycleGuard(
      reflector,
      makePrisma({ status: 'SUSPENDED' }) as never,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
