import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import type {
  PlatformAuditLogInput,
  TenantAuditLogInput,
} from '../common/audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupportSessionService } from './support-session.service';

/**
 * Phase 5 W6. Unit tests against a mocked `PrismaService` whose
 * `$transaction` invokes the callback with a fake `tx` — the same
 * mocking-shape convention `platform.service.spec.ts` already established.
 * Real-Postgres transactional rollback and full HTTP-level authorization
 * are proven end-to-end in `test/e2e/support-session.e2e-spec.ts`; this
 * file proves `SupportSessionService`'s own logic in isolation.
 */
describe('SupportSessionService', () => {
  const actor: AuthenticatedUser = {
    id: 'super-admin-1',
    email: 'sa@example.test',
    role: 'ADMIN',
    platformRole: 'SUPER_ADMIN',
    memberships: [],
  };

  const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const PAST = new Date(Date.now() - 60 * 1000).toISOString();

  function makePrisma(options: {
    tenant?: { id: string; status: TenantStatus } | null;
    session?: Record<string, unknown> | null;
    revokeCasCount?: number;
    createdSession?: Record<string, unknown>;
  }) {
    const tx = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(options.tenant ?? null),
      },
      supportSession: {
        create: jest.fn().mockResolvedValue(
          options.createdSession ?? {
            id: 'session-1',
            tenantId: options.tenant?.id ?? 'tenant-a',
            createdByUserId: actor.id,
            justification: 'investigating a billing dispute',
            grantedPermissions: ['orders:read'],
            expiresAt: new Date(FUTURE),
            revokedAt: null,
            revokedByUserId: null,
            createdAt: new Date(),
          },
        ),
        findUnique: jest.fn().mockResolvedValue(options.session ?? null),
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: options.revokeCasCount ?? 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...(options.session ?? {}),
          revokedAt: new Date(),
          revokedByUserId: actor.id,
        }),
      },
    };
    const prisma = {
      supportSession: { findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    return { prisma, tx };
  }

  function makeAudit() {
    return {
      logPlatformAction: jest
        .fn<Promise<void>, [unknown, PlatformAuditLogInput]>()
        .mockResolvedValue(undefined),
      logTenantAction: jest
        .fn<Promise<void>, [unknown, TenantAuditLogInput]>()
        .mockResolvedValue(undefined),
    };
  }

  describe('createSession', () => {
    it('creates a session for an ACTIVE tenant, writes exactly one PlatformAuditLog and one TenantAuditLog (viaSupportSessionId set, no fabricated membership), returns an ACTIVE view', async () => {
      const { prisma, tx } = makePrisma({
        tenant: { id: 'tenant-a', status: TenantStatus.ACTIVE },
      });
      const audit = makeAudit();
      const service = new SupportSessionService(prisma as never, audit);

      const result = await service.createSession(
        actor,
        {
          tenantId: 'tenant-a',
          justification: 'investigating a billing dispute',
          expiresAt: FUTURE,
          grantedPermissions: ['orders:read'],
        },
        '203.0.113.7',
      );

      expect(tx.supportSession.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-a',
          createdByUserId: actor.id,
          justification: 'investigating a billing dispute',
          grantedPermissions: ['orders:read'],
          // jest's own `expect.any(Date)` matcher is typed `any` by
          // design — no cast here avoids it either way (adding one
          // conflicts with no-unnecessary-type-assertion, since `tx` is
          // untyped here and would already accept it).
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          expiresAt: expect.any(Date),
        },
      });

      expect(audit.logPlatformAction).toHaveBeenCalledTimes(1);
      expect(audit.logPlatformAction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          actorUserId: actor.id,
          action: 'support_session.create',
          targetType: 'SupportSession',
          tenantId: 'tenant-a',
          justification: 'investigating a billing dispute',
          ip: '203.0.113.7',
        }),
      );

      expect(audit.logTenantAction).toHaveBeenCalledTimes(1);
      const tenantAuditCall = audit.logTenantAction.mock.calls[0][1];
      expect(tenantAuditCall.tenantId).toBe('tenant-a');
      expect(tenantAuditCall.viaSupportSessionId).toBe('session-1');
      expect(tenantAuditCall.actorMembershipId).toBeUndefined();
      expect(tenantAuditCall.actorCustomerId).toBeUndefined();

      expect(result.status).toBe('ACTIVE');
      expect(result.id).toBe('session-1');
    });

    it('rejects a nonexistent tenant with NotFoundException', async () => {
      const { prisma } = makePrisma({ tenant: null });
      const service = new SupportSessionService(prisma as never, makeAudit());
      await expect(
        service.createSession(
          actor,
          {
            tenantId: 'no-such-tenant',
            justification: 'x',
            expiresAt: FUTURE,
            grantedPermissions: ['orders:read'],
          },
          '203.0.113.7',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a SUSPENDED tenant with ConflictException', async () => {
      const { prisma } = makePrisma({
        tenant: { id: 'tenant-a', status: TenantStatus.SUSPENDED },
      });
      const service = new SupportSessionService(prisma as never, makeAudit());
      await expect(
        service.createSession(
          actor,
          {
            tenantId: 'tenant-a',
            justification: 'x',
            expiresAt: FUTURE,
            grantedPermissions: ['orders:read'],
          },
          '203.0.113.7',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it.each([TenantStatus.PENDING_DELETION, TenantStatus.DELETED])(
      'rejects a %s tenant with ConflictException too (creation requires strict ACTIVE, not merely "not SUSPENDED")',
      async (status) => {
        const { prisma } = makePrisma({ tenant: { id: 'tenant-a', status } });
        const service = new SupportSessionService(prisma as never, makeAudit());
        await expect(
          service.createSession(
            actor,
            {
              tenantId: 'tenant-a',
              justification: 'x',
              expiresAt: FUTURE,
              grantedPermissions: ['orders:read'],
            },
            '203.0.113.7',
          ),
        ).rejects.toThrow(ConflictException);
      },
    );

    it('rejects a past expiresAt with BadRequestException and never opens a transaction', async () => {
      const { prisma } = makePrisma({
        tenant: { id: 'tenant-a', status: TenantStatus.ACTIVE },
      });
      const service = new SupportSessionService(prisma as never, makeAudit());
      await expect(
        service.createSession(
          actor,
          {
            tenantId: 'tenant-a',
            justification: 'x',
            expiresAt: PAST,
            grantedPermissions: ['orders:read'],
          },
          '203.0.113.7',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a non-parseable expiresAt with BadRequestException (defensive — DTO validation already blocks this at the HTTP layer)', async () => {
      const { prisma } = makePrisma({
        tenant: { id: 'tenant-a', status: TenantStatus.ACTIVE },
      });
      const service = new SupportSessionService(prisma as never, makeAudit());
      await expect(
        service.createSession(
          actor,
          {
            tenantId: 'tenant-a',
            justification: 'x',
            expiresAt: 'not-a-date',
            grantedPermissions: ['orders:read'],
          },
          '203.0.113.7',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('revokeSession', () => {
    const existingSession = {
      id: 'session-1',
      tenantId: 'tenant-a',
      createdByUserId: 'admin-1',
      justification: 'x',
      grantedPermissions: ['orders:read'],
      expiresAt: new Date(FUTURE),
      revokedAt: null,
      revokedByUserId: null,
      createdAt: new Date(),
    };

    it('revokes an active session, writes exactly one PlatformAuditLog and one TenantAuditLog (viaSupportSessionId set), returns a REVOKED view', async () => {
      const { prisma, tx } = makePrisma({ session: existingSession });
      const audit = makeAudit();
      const service = new SupportSessionService(prisma as never, audit);

      const result = await service.revokeSession(
        actor,
        'session-1',
        '203.0.113.7',
      );

      expect(tx.supportSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', revokedAt: null },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: { revokedAt: expect.any(Date), revokedByUserId: actor.id },
      });
      expect(audit.logPlatformAction).toHaveBeenCalledTimes(1);
      expect(audit.logTenantAction).toHaveBeenCalledTimes(1);
      const revokeAuditCall = audit.logTenantAction.mock.calls[0][1];
      expect(revokeAuditCall.viaSupportSessionId).toBe('session-1');
      expect(result.status).toBe('REVOKED');
    });

    it('rejects a nonexistent session with NotFoundException', async () => {
      const { prisma } = makePrisma({ session: null });
      const service = new SupportSessionService(prisma as never, makeAudit());
      await expect(
        service.revokeSession(actor, 'no-such-session', '203.0.113.7'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an already-revoked session with ConflictException (repeated revoke is a safe, explicit conflict, not a silent no-op)', async () => {
      const { prisma } = makePrisma({
        session: { ...existingSession, revokedAt: new Date() },
      });
      const service = new SupportSessionService(prisma as never, makeAudit());
      await expect(
        service.revokeSession(actor, 'session-1', '203.0.113.7'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects on a lost CAS race with ConflictException', async () => {
      const { prisma } = makePrisma({
        session: existingSession,
        revokeCasCount: 0,
      });
      const service = new SupportSessionService(prisma as never, makeAudit());
      await expect(
        service.revokeSession(actor, 'session-1', '203.0.113.7'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listSessions', () => {
    function makeListPrisma() {
      return {
        supportSession: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
        $transaction: jest.fn(),
      };
    }

    it('paginates and filters by tenantId when given', async () => {
      const prisma = makeListPrisma();
      const service = new SupportSessionService(prisma as never, makeAudit());
      await service.listSessions({
        page: 2,
        limit: 10,
        tenantId: 'tenant-a',
      });
      expect(prisma.supportSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-a' },
          skip: 10,
          take: 10,
        }),
      );
    });

    it.each([
      [
        'ACTIVE',
        {
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) as unknown as Date },
        },
      ],
      ['REVOKED', { revokedAt: { not: null } }],
      [
        'EXPIRED',
        {
          revokedAt: null,
          expiresAt: { lte: expect.any(Date) as unknown as Date },
        },
      ],
    ] as const)(
      'translates status=%s into the equivalent where clause',
      async (status, expectedWhere) => {
        const prisma = makeListPrisma();
        const service = new SupportSessionService(prisma as never, makeAudit());
        await service.listSessions({ page: 1, limit: 20, status });
        expect(prisma.supportSession.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expectedWhere }),
        );
      },
    );
  });
});
