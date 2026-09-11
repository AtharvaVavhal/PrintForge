import { ForbiddenException } from '@nestjs/common';
import { assertTenantActive } from './tenant-lifecycle';

/**
 * Phase 5 W4. Unit tests for the single, shared lifecycle check — every
 * call site (`TenantLifecycleGuard`, `StorefrontTenantResolver`,
 * `CheckoutService`) delegates here, so this file is where the actual
 * ACTIVE/SUSPENDED decision logic is proven, once.
 */
describe('assertTenantActive', () => {
  function makePrisma(tenant: { status: string } | null) {
    return {
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
    };
  }

  it('resolves without throwing for an ACTIVE tenant', async () => {
    const prisma = makePrisma({ status: 'ACTIVE' });
    await expect(
      assertTenantActive(prisma as never, 'tenant-a', 'blocked'),
    ).resolves.toBeUndefined();
  });

  it('throws ForbiddenException with the given message for a SUSPENDED tenant', async () => {
    const prisma = makePrisma({ status: 'SUSPENDED' });
    const message = 'This store is currently unavailable';
    await expect(
      assertTenantActive(prisma as never, 'tenant-a', message),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      assertTenantActive(prisma as never, 'tenant-a', message),
    ).rejects.toThrow(message);
  });

  it.each(['PENDING_DELETION', 'DELETED'])(
    'does NOT throw for a %s tenant — W4 implements ACTIVE<->SUSPENDED only, never blocks on any other status',
    async (status) => {
      const prisma = makePrisma({ status });
      await expect(
        assertTenantActive(prisma as never, 'tenant-a', 'blocked'),
      ).resolves.toBeUndefined();
    },
  );

  it('does not throw when the tenant is not found (defensive — should not occur in practice since Tenant rows are never hard-deleted)', async () => {
    const prisma = makePrisma(null);
    await expect(
      assertTenantActive(prisma as never, 'missing', 'blocked'),
    ).resolves.toBeUndefined();
  });

  it('queries by exactly the tenantId passed — never a different one', async () => {
    const prisma = makePrisma({ status: 'ACTIVE' });
    await assertTenantActive(prisma as never, 'tenant-specific-id', 'blocked');
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: 'tenant-specific-id' },
      select: { status: true },
    });
  });
});
