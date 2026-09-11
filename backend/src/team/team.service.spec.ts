import { ConflictException, NotFoundException } from '@nestjs/common';
import { MembershipStatus, TenantRole } from '@prisma/client';
import type {
  PlatformAuditLogInput,
  TenantAuditLogInput,
} from '../common/audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TenantContext } from '../common/tenant/tenant-context';
import { TeamService } from './team.service';

/**
 * Phase 5 W7. Unit tests against a mocked `PrismaService` whose
 * `$transaction` invokes the callback with a fake `tx` — the same
 * mocking-shape convention `platform.service.spec.ts`/
 * `support-session.service.spec.ts` already established. Real-Postgres
 * transactional rollback and full HTTP-level authorization are proven
 * end-to-end in `test/e2e/team-management.e2e-spec.ts`.
 */
describe('TeamService', () => {
  const actor: AuthenticatedUser = {
    id: 'owner-user-1',
    email: 'owner@example.test',
    role: 'ADMIN',
    platformRole: null,
    memberships: [{ tenantId: 'tenant-a', role: 'OWNER' }],
  };

  const ownerTenantContext: TenantContext = {
    tenantId: 'tenant-a',
    source: 'membership-default',
    membership: { role: 'OWNER' },
  };

  const supportSessionTenantContext: TenantContext = {
    tenantId: 'tenant-a',
    source: 'support-session',
    supportSession: { id: 'session-1', grantedPermissions: ['members:manage'] },
  };

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

  function makePrisma(options: {
    user?: { id: string } | null;
    existingMembership?: Record<string, unknown> | null;
    createdMembership?: Record<string, unknown>;
    targetMembership?: Record<string, unknown> | null;
    actorMembership?: { id: string } | null;
    activeOwnerCount?: number;
    casCount?: number;
    updatedMembership?: Record<string, unknown>;
  }) {
    const baseUser = { id: 'target-user-1', email: 'target@example.test' };
    const membershipCalls: Array<Record<string, unknown>> = [];

    const tx = {
      user: { findUnique: jest.fn() },
      tenantMembership: {
        findUnique: jest.fn((args: { where: Record<string, unknown> }) => {
          membershipCalls.push(args.where);
          if ('userId_tenantId' in args.where) {
            const key = args.where.userId_tenantId as {
              userId: string;
              tenantId: string;
            };
            if (key.userId === actor.id) {
              return Promise.resolve(options.actorMembership ?? null);
            }
            return Promise.resolve(options.existingMembership ?? null);
          }
          return Promise.resolve(options.targetMembership ?? null);
        }),
        create: jest.fn().mockResolvedValue(
          options.createdMembership ?? {
            id: 'membership-new',
            tenantId: 'tenant-a',
            userId: baseUser.id,
            role: TenantRole.STAFF,
            status: MembershipStatus.INVITED,
            invitedByUserId: actor.id,
            createdAt: new Date(),
            updatedAt: new Date(),
            user: baseUser,
          },
        ),
        count: jest.fn().mockResolvedValue(options.activeOwnerCount ?? 2),
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: options.casCount ?? 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(
          options.updatedMembership ?? {
            id: 'membership-1',
            tenantId: 'tenant-a',
            userId: baseUser.id,
            role: TenantRole.ADMIN,
            status: MembershipStatus.ACTIVE,
            invitedByUserId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            user: baseUser,
          },
        ),
      },
    };
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue('user' in options ? options.user : baseUser),
      },
      tenantMembership: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    return { prisma, tx, membershipCalls };
  }

  describe('listTeam', () => {
    it('scopes to the given tenantId and paginates', async () => {
      const { prisma } = makePrisma({});
      const service = new TeamService(prisma as never, makeAudit());
      await service.listTeam('tenant-a', { page: 2, limit: 5 });
      expect(prisma.tenantMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-a' },
          skip: 5,
          take: 5,
        }),
      );
    });
  });

  describe('inviteMember', () => {
    it('creates an INVITED membership, audits it (actorMembershipId set, viaSupportSessionId null), no fabricated membership', async () => {
      const { prisma, tx } = makePrisma({
        actorMembership: { id: 'owner-membership-1' },
      });
      const audit = makeAudit();
      const service = new TeamService(prisma as never, audit);

      const result = await service.inviteMember(ownerTenantContext, actor, {
        email: 'target@example.test',
        role: TenantRole.STAFF,
      });

      expect(tx.tenantMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            userId: 'target-user-1',
            tenantId: 'tenant-a',
            role: TenantRole.STAFF,
            status: MembershipStatus.INVITED,
            invitedByUserId: actor.id,
          }),
        }),
      );
      expect(audit.logTenantAction).toHaveBeenCalledTimes(1);
      const call = audit.logTenantAction.mock.calls[0][1];
      expect(call.tenantId).toBe('tenant-a');
      expect(call.action).toBe('team.invite');
      expect(call.actorMembershipId).toBe('owner-membership-1');
      expect(call.viaSupportSessionId).toBeUndefined();
      expect(result.status).toBe(MembershipStatus.INVITED);
    });

    it('attributes via viaSupportSessionId (not a fabricated membership) when the actor is a support session', async () => {
      const { prisma, tx } = makePrisma({ actorMembership: null });
      const audit = makeAudit();
      const service = new TeamService(prisma as never, audit);

      await service.inviteMember(supportSessionTenantContext, actor, {
        email: 'target@example.test',
        role: TenantRole.STAFF,
      });

      expect(tx.tenantMembership.create).toHaveBeenCalled();
      const call = audit.logTenantAction.mock.calls[0][1];
      expect(call.actorMembershipId).toBeUndefined();
      expect(call.viaSupportSessionId).toBe('session-1');
    });

    it('rejects when no User exists for that email', async () => {
      const { prisma } = makePrisma({ user: null });
      const service = new TeamService(prisma as never, makeAudit());
      await expect(
        service.inviteMember(ownerTenantContext, actor, {
          email: 'nobody@example.test',
          role: TenantRole.STAFF,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a duplicate membership (any status) for the same user+tenant', async () => {
      const { prisma } = makePrisma({
        existingMembership: { status: MembershipStatus.SUSPENDED },
      });
      const service = new TeamService(prisma as never, makeAudit());
      await expect(
        service.inviteMember(ownerTenantContext, actor, {
          email: 'target@example.test',
          role: TenantRole.STAFF,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('the whole operation fails (never a "membership created, audit lost" split) when the audit write itself fails — proves the mutation and the audit run inside the SAME transaction, so a real Postgres transaction would roll back the membership create too', async () => {
      const { prisma, tx } = makePrisma({
        actorMembership: { id: 'owner-membership-1' },
      });
      const audit = makeAudit();
      audit.logTenantAction.mockRejectedValueOnce(new Error('audit db down'));
      const service = new TeamService(prisma as never, audit);

      await expect(
        service.inviteMember(ownerTenantContext, actor, {
          email: 'target@example.test',
          role: TenantRole.STAFF,
        }),
      ).rejects.toThrow('audit db down');
      // The create call did happen (this is exactly why it MUST be inside
      // one transaction with the audit write) — a real $transaction would
      // roll it back atomically because both calls are awaited inside the
      // SAME callback with no catch that swallows the audit failure.
      expect(tx.tenantMembership.create).toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('changes role, audits fromRole/toRole, attributes to the acting OWNER membership', async () => {
      const { prisma, tx } = makePrisma({
        targetMembership: {
          id: 'membership-1',
          tenantId: 'tenant-a',
          role: TenantRole.STAFF,
          status: MembershipStatus.ACTIVE,
        },
        actorMembership: { id: 'owner-membership-1' },
      });
      const audit = makeAudit();
      const service = new TeamService(prisma as never, audit);

      const result = await service.updateRole(
        ownerTenantContext,
        actor,
        'membership-1',
        { role: TenantRole.ADMIN },
      );

      expect(tx.tenantMembership.updateMany).toHaveBeenCalledWith({
        where: { id: 'membership-1', tenantId: 'tenant-a', role: 'STAFF' },
        data: { role: TenantRole.ADMIN },
      });
      const call = audit.logTenantAction.mock.calls[0][1];
      expect(call.action).toBe('team.role_change');
      expect(call.actorMembershipId).toBe('owner-membership-1');
      expect(result.role).toBe(TenantRole.ADMIN);
    });

    it('a membership from a different tenant is treated as not found (404-shaped, tenant isolation)', async () => {
      const { prisma } = makePrisma({
        targetMembership: {
          id: 'membership-1',
          tenantId: 'tenant-B',
          role: TenantRole.STAFF,
          status: MembershipStatus.ACTIVE,
        },
      });
      const service = new TeamService(prisma as never, makeAudit());
      await expect(
        service.updateRole(ownerTenantContext, actor, 'membership-1', {
          role: TenantRole.ADMIN,
        }),
      ).rejects.toThrow('Not Found');
    });

    it("rejects demoting the tenant's final ACTIVE OWNER", async () => {
      const { prisma } = makePrisma({
        targetMembership: {
          id: 'membership-owner',
          tenantId: 'tenant-a',
          role: TenantRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
        activeOwnerCount: 1,
      });
      const service = new TeamService(prisma as never, makeAudit());
      await expect(
        service.updateRole(ownerTenantContext, actor, 'membership-owner', {
          role: TenantRole.ADMIN,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('permits demoting an OWNER when another ACTIVE OWNER remains', async () => {
      const { prisma, tx } = makePrisma({
        targetMembership: {
          id: 'membership-owner',
          tenantId: 'tenant-a',
          role: TenantRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
        activeOwnerCount: 2,
        actorMembership: { id: 'owner-membership-1' },
      });
      const service = new TeamService(prisma as never, makeAudit());
      await service.updateRole(ownerTenantContext, actor, 'membership-owner', {
        role: TenantRole.ADMIN,
      });
      expect(tx.tenantMembership.updateMany).toHaveBeenCalled();
    });

    it('rejects on a lost CAS race', async () => {
      const { prisma } = makePrisma({
        targetMembership: {
          id: 'membership-1',
          tenantId: 'tenant-a',
          role: TenantRole.STAFF,
          status: MembershipStatus.ACTIVE,
        },
        casCount: 0,
      });
      const service = new TeamService(prisma as never, makeAudit());
      await expect(
        service.updateRole(ownerTenantContext, actor, 'membership-1', {
          role: TenantRole.ADMIN,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('suspendMember', () => {
    it('suspends a non-protected member and audits it', async () => {
      const { prisma, tx } = makePrisma({
        targetMembership: {
          id: 'membership-1',
          tenantId: 'tenant-a',
          role: TenantRole.STAFF,
          status: MembershipStatus.ACTIVE,
        },
        actorMembership: { id: 'owner-membership-1' },
      });
      const audit = makeAudit();
      const service = new TeamService(prisma as never, audit);

      await service.suspendMember(ownerTenantContext, actor, 'membership-1');

      expect(tx.tenantMembership.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'membership-1',
          tenantId: 'tenant-a',
          status: { not: MembershipStatus.SUSPENDED },
        },
        data: { status: MembershipStatus.SUSPENDED },
      });
      const call = audit.logTenantAction.mock.calls[0][1];
      expect(call.action).toBe('team.suspend');
    });

    it('rejects suspending an already-suspended membership', async () => {
      const { prisma } = makePrisma({
        targetMembership: {
          id: 'membership-1',
          tenantId: 'tenant-a',
          role: TenantRole.STAFF,
          status: MembershipStatus.SUSPENDED,
        },
      });
      const service = new TeamService(prisma as never, makeAudit());
      await expect(
        service.suspendMember(ownerTenantContext, actor, 'membership-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects suspending the final ACTIVE OWNER', async () => {
      const { prisma } = makePrisma({
        targetMembership: {
          id: 'membership-owner',
          tenantId: 'tenant-a',
          role: TenantRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
        activeOwnerCount: 1,
      });
      const service = new TeamService(prisma as never, makeAudit());
      await expect(
        service.suspendMember(ownerTenantContext, actor, 'membership-owner'),
      ).rejects.toThrow(ConflictException);
    });

    it('a membership from a different tenant is treated as not found', async () => {
      const { prisma } = makePrisma({
        targetMembership: {
          id: 'membership-1',
          tenantId: 'tenant-B',
          role: TenantRole.STAFF,
          status: MembershipStatus.ACTIVE,
        },
      });
      const service = new TeamService(prisma as never, makeAudit());
      await expect(
        service.suspendMember(ownerTenantContext, actor, 'membership-1'),
      ).rejects.toThrow('Not Found');
    });
  });
});
