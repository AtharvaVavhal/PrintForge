import { Prisma } from '@prisma/client';
import {
  AuditService,
  PlatformAuditLogInput,
  TenantAuditLogInput,
} from './audit.service';

/**
 * W2 (Phase 5 decisions P5-D3 / P5-D4A). Unit tests against a mocked
 * `Prisma.TransactionClient` — the same shape convention already used
 * elsewhere in this codebase (e.g. `platform.guard.spec.ts`'s fake
 * `ExecutionContext`). Real transactional-insert behavior (the row
 * genuinely lands inside the caller's transaction) is proven by whichever
 * Phase 5 W-package first calls this service for real (W4 tenant
 * lifecycle, W6 support sessions, W7 team management, W8 tenant-admin
 * wiring); this file proves the service's own contract in isolation.
 */
describe('AuditService', () => {
  function makeTx() {
    const platformCreate = jest
      .fn<Promise<void>, [{ data: PlatformAuditLogInput }]>()
      .mockResolvedValue(undefined);
    const tenantCreate = jest
      .fn<Promise<void>, [{ data: TenantAuditLogInput }]>()
      .mockResolvedValue(undefined);
    return {
      platformAuditLog: { create: platformCreate },
      tenantAuditLog: { create: tenantCreate },
    };
  }

  it('creates a platform audit record with exactly the given fields', async () => {
    const tx = makeTx();
    const service = new AuditService();
    const input: PlatformAuditLogInput = {
      actorUserId: 'super-admin-1',
      action: 'tenant.suspend',
      targetType: 'Tenant',
      targetId: 'tenant-a',
      tenantId: 'tenant-a',
      justification: 'customer requested account hold',
      metadata: { note: 'ok' },
      ip: '203.0.113.7',
    };

    await service.logPlatformAction(
      tx as unknown as Prisma.TransactionClient,
      input,
    );

    expect(tx.platformAuditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.platformAuditLog.create).toHaveBeenCalledWith({ data: input });
  });

  it('platform audit tenantId is optional — a purely platform-internal action omits it', async () => {
    const tx = makeTx();
    const service = new AuditService();
    const input: PlatformAuditLogInput = {
      actorUserId: 'super-admin-1',
      action: 'platform_audit.read',
      targetType: 'PlatformAuditLog',
      targetId: 'n/a',
      metadata: {},
      ip: '203.0.113.7',
    };

    await service.logPlatformAction(
      tx as unknown as Prisma.TransactionClient,
      input,
    );

    const [[written]] = tx.platformAuditLog.create.mock.calls;
    expect(written.data.tenantId).toBeUndefined();
    expect(written.data.justification).toBeUndefined();
  });

  it('creates a tenant audit record for exactly the tenant it was called with', async () => {
    const tx = makeTx();
    const service = new AuditService();
    const input: TenantAuditLogInput = {
      tenantId: 'tenant-a',
      actorMembershipId: 'membership-a-owner',
      action: 'settings.update',
      targetType: 'AppSetting',
      targetId: 'tax.ratePercent',
      metadata: { key: 'tax.ratePercent', newValue: '18' },
    };

    await service.logTenantAction(
      tx as unknown as Prisma.TransactionClient,
      input,
    );

    expect(tx.tenantAuditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.tenantAuditLog.create).toHaveBeenCalledWith({ data: input });
  });

  it("never lets one call's tenantId leak into another — two calls for two tenants stay fully independent", async () => {
    const tx = makeTx();
    const service = new AuditService();

    await service.logTenantAction(tx as unknown as Prisma.TransactionClient, {
      tenantId: 'tenant-a',
      action: 'team.invite',
      targetType: 'TenantMembership',
      targetId: 'membership-a-new',
      metadata: {},
    });
    await service.logTenantAction(tx as unknown as Prisma.TransactionClient, {
      tenantId: 'tenant-b',
      action: 'team.invite',
      targetType: 'TenantMembership',
      targetId: 'membership-b-new',
      metadata: {},
    });

    expect(tx.tenantAuditLog.create).toHaveBeenCalledTimes(2);
    const [[firstCall], [secondCall]] = tx.tenantAuditLog.create.mock.calls;
    expect(firstCall.data.tenantId).toBe('tenant-a');
    expect(secondCall.data.tenantId).toBe('tenant-b');
    // The service holds no instance state that could carry a tenantId
    // across calls — each write reflects only its own explicit argument.
    expect(firstCall.data.targetId).toBe('membership-a-new');
    expect(secondCall.data.targetId).toBe('membership-b-new');
  });

  it('has no update/delete/upsert method for either model — append-only by construction', () => {
    const service = new AuditService();
    const methodNames = Object.getOwnPropertyNames(
      Object.getPrototypeOf(service),
    );
    expect(methodNames).toEqual(
      expect.arrayContaining(['logPlatformAction', 'logTenantAction']),
    );
    const hasMutationMethod = methodNames.some((m) =>
      /update|delete|upsert/i.test(m),
    );
    expect(hasMutationMethod).toBe(false);
  });

  it('carries the SupportSession attribution field through untouched when present (P5-D4A forward reference)', async () => {
    const tx = makeTx();
    const service = new AuditService();
    await service.logTenantAction(tx as unknown as Prisma.TransactionClient, {
      tenantId: 'tenant-a',
      action: 'orders.read',
      targetType: 'Order',
      targetId: 'order-1',
      metadata: {},
      viaSupportSessionId: 'support-session-1',
    });

    const [[written]] = tx.tenantAuditLog.create.mock.calls;
    expect(written.data.viaSupportSessionId).toBe('support-session-1');
  });
});
