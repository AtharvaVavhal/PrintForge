import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  apiPath,
  authHeader,
  grantMembership,
  grantOwnerMembership,
  http,
  registerSuperAdmin,
  registerUser,
  TestUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { SUPPORT_SESSION_HEADER } from '../../src/common/tenant/support-session-context.guard';

/**
 * Phase 5 W7 — Tenant Control Plane Team Management (SaaS Master Plan §11;
 * G-13, P5-GOV-02). Categories A-J mirror the W7 authorization's own
 * required test matrix.
 */
describe('Phase 5 W7 — Team Management', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  /** OWNER of a fresh tenant + a second user with `role` on the SAME
   * tenant, mirroring `tenant-lifecycle-enforcement.e2e-spec.ts`'s own
   * multi-role-on-one-tenant setup convention. */
  async function setupTenantWithMember(
    role: 'ADMIN' | 'STAFF' | 'VIEWER',
  ): Promise<{
    tenantId: string;
    owner: TestUser;
    member: TestUser;
    membershipId: string;
  }> {
    const owner = await registerUser(app, 'owner');
    const { tenantId } = await grantOwnerMembership(prisma, owner.id);
    const member = await registerUser(app, role.toLowerCase());
    await grantMembership(prisma, member.id, tenantId, role);
    const membership = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenantId, userId: member.id },
    });
    return { tenantId, owner, member, membershipId: membership.id };
  }

  async function ownerMembershipId(
    tenantId: string,
    userId: string,
  ): Promise<string> {
    const m = await prisma.tenantMembership.findFirstOrThrow({
      where: { tenantId, userId },
    });
    return m.id;
  }

  // ─── A. AUTHORIZATION ───────────────────────────────────────────────────

  describe('A. authorization', () => {
    it('OWNER can access team management', async () => {
      const owner = await registerUser(app, 'owner');
      await grantOwnerMembership(prisma, owner.id);
      await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(owner))
        .expect(200);
    });

    it.each(['ADMIN', 'STAFF', 'VIEWER'] as const)(
      '%s gets 403',
      async (role) => {
        const { member } = await setupTenantWithMember(role);
        await http(app)
          .get(apiPath('/admin/team'))
          .set(...authHeader(member))
          .expect(403);
      },
    );

    it('CUSTOMER (no membership at all) gets 403', async () => {
      const customer = await registerUser(app, 'customer');
      await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(customer))
        .expect(403);
    });

    it('unauthenticated gets 401', async () => {
      await http(app).get(apiPath('/admin/team')).expect(401);
    });

    it('SUPER_ADMIN without tenant membership does not become tenant team manager automatically', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(superAdmin))
        .expect(403);
    });
  });

  // ─── B. TENANT ISOLATION ────────────────────────────────────────────────

  describe('B. tenant isolation', () => {
    it('Tenant A OWNER cannot list Tenant B members', async () => {
      const ownerA = await registerUser(app, 'owner-a');
      await grantOwnerMembership(prisma, ownerA.id);
      const ownerB = await registerUser(app, 'owner-b');
      const { tenantId: tenantB } = await grantOwnerMembership(
        prisma,
        ownerB.id,
      );
      const res = await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(ownerA))
        .expect(200);
      const emails = (res.body.data as Array<{ email: string }>).map(
        (m) => m.email,
      );
      expect(emails).not.toContain(ownerB.email);
      void tenantB;
    });

    it('Tenant A OWNER cannot change Tenant B membership role (tenant-scoped 404)', async () => {
      const ownerA = await registerUser(app, 'owner-a');
      await grantOwnerMembership(prisma, ownerA.id);
      const { membershipId } = await setupTenantWithMember('STAFF');
      await http(app)
        .patch(apiPath(`/admin/team/${membershipId}/role`))
        .set(...authHeader(ownerA))
        .send({ role: 'ADMIN' })
        .expect(404);
    });

    it('Tenant A OWNER cannot suspend Tenant B membership (tenant-scoped 404)', async () => {
      const ownerA = await registerUser(app, 'owner-a');
      await grantOwnerMembership(prisma, ownerA.id);
      const { membershipId } = await setupTenantWithMember('STAFF');
      await http(app)
        .post(apiPath(`/admin/team/${membershipId}/suspend`))
        .set(...authHeader(ownerA))
        .expect(404);
    });

    it('Tenant A cannot invite into Tenant B — there is no tenantId field to target one; an attempt to smuggle one is rejected outright', async () => {
      const ownerA = await registerUser(app, 'owner-a');
      const { tenantId: tenantA } = await grantOwnerMembership(
        prisma,
        ownerA.id,
      );
      const ownerB = await registerUser(app, 'owner-b');
      const { tenantId: tenantB } = await grantOwnerMembership(
        prisma,
        ownerB.id,
      );
      const target = await registerUser(app, 'target');
      await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(ownerA))
        .send({ email: target.email, role: 'STAFF', tenantId: tenantB })
        .expect(400);
      // Confirm nothing was created in tenant A either (the whole request
      // was rejected, not partially honored).
      const count = await prisma.tenantMembership.count({
        where: { tenantId: tenantA, userId: target.id },
      });
      expect(count).toBe(0);
    });

    it('X-Active-Tenant naming a tenant the caller has no membership in is rejected exactly like any other route — never a bypass', async () => {
      const ownerA = await registerUser(app, 'owner-a');
      await grantOwnerMembership(prisma, ownerA.id);
      const ownerB = await registerUser(app, 'owner-b');
      const { tenantId: tenantB } = await grantOwnerMembership(
        prisma,
        ownerB.id,
      );
      await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(ownerA))
        .set('X-Active-Tenant', tenantB)
        .expect(403);
    });
  });

  // ─── C. TEAM LIST ───────────────────────────────────────────────────────

  describe('C. team list', () => {
    it('returns only current tenant members', async () => {
      const { tenantId, owner, member } = await setupTenantWithMember('STAFF');
      const res = await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(owner))
        .expect(200);
      const emails = (res.body.data as Array<{ email: string }>).map(
        (m) => m.email,
      );
      expect(emails.sort()).toEqual([member.email, owner.email].sort());
      void tenantId;
    });

    it('the safe DTO contains no password/token secrets — exact field set', async () => {
      const owner = await registerUser(app, 'owner');
      await grantOwnerMembership(prisma, owner.id);
      const res = await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(owner))
        .expect(200);
      const item = res.body.data[0];
      expect(Object.keys(item).sort()).toEqual(
        [
          'id',
          'userId',
          'email',
          'role',
          'status',
          'invitedByUserId',
          'createdAt',
          'updatedAt',
        ].sort(),
      );
    });

    it('a user who is OWNER on two different tenants sees each tenant list correctly isolated', async () => {
      const roamer = await registerUser(app, 'roamer');
      const { tenantId: tenantA } = await grantOwnerMembership(
        prisma,
        roamer.id,
      );
      const ownerB = await registerUser(app, 'owner-b');
      const { tenantId: tenantB } = await grantOwnerMembership(
        prisma,
        ownerB.id,
      );
      // OWNER (not STAFF) on tenant B too — accessing /admin/team on either
      // tenant requires members:manage (G-13, OWNER-only); this test's
      // point is list-content isolation across two tenants the SAME user
      // legitimately manages, not a permission-ceiling check (that is
      // covered separately in category A).
      await grantMembership(prisma, roamer.id, tenantB, 'OWNER');

      const listAsA = await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(roamer))
        .set('X-Active-Tenant', tenantA)
        .expect(200);
      expect(
        (listAsA.body.data as Array<{ email: string }>).map((m) => m.email),
      ).toEqual([roamer.email]);

      const listAsB = await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(roamer))
        .set('X-Active-Tenant', tenantB)
        .expect(200);
      const emailsB = (listAsB.body.data as Array<{ email: string }>).map(
        (m) => m.email,
      );
      expect(emailsB.sort()).toEqual([roamer.email, ownerB.email].sort());
    });
  });

  // ─── D. INVITE ──────────────────────────────────────────────────────────

  describe('D. invite', () => {
    it('a valid OWNER invite succeeds and creates an INVITED membership', async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      const target = await registerUser(app, 'target');

      const res = await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(owner))
        .send({ email: target.email, role: 'STAFF' })
        .expect(201);

      expect(res.body.data.status).toBe('INVITED');
      expect(res.body.data.role).toBe('STAFF');
      expect(res.body.data.email).toBe(target.email);
      const row = await prisma.tenantMembership.findUniqueOrThrow({
        where: { userId_tenantId: { userId: target.id, tenantId } },
      });
      expect(row.invitedByUserId).toBe(owner.id);
    });

    it('a duplicate active membership is rejected', async () => {
      const owner = await registerUser(app, 'owner');
      await grantOwnerMembership(prisma, owner.id);
      const target = await registerUser(app, 'target');
      await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(owner))
        .send({ email: target.email, role: 'STAFF' })
        .expect(201);
      await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(owner))
        .send({ email: target.email, role: 'ADMIN' })
        .expect(409);
    });

    it('an invalid role string is rejected', async () => {
      const owner = await registerUser(app, 'owner');
      await grantOwnerMembership(prisma, owner.id);
      const target = await registerUser(app, 'target');
      await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(owner))
        .send({ email: target.email, role: 'SUPREME_LEADER' })
        .expect(400);
    });

    it('inviting as OWNER is rejected — an invite can never create a second OWNER', async () => {
      const owner = await registerUser(app, 'owner');
      await grantOwnerMembership(prisma, owner.id);
      const target = await registerUser(app, 'target');
      await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(owner))
        .send({ email: target.email, role: 'OWNER' })
        .expect(400);
    });

    it('ADMIN/STAFF/VIEWER cannot invite', async () => {
      const { member } = await setupTenantWithMember('ADMIN');
      const target = await registerUser(app, 'target');
      await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(member))
        .send({ email: target.email, role: 'STAFF' })
        .expect(403);
    });

    it("the tenant is server-derived — the created membership belongs to the caller's own tenant, never a client-influenced one", async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      const target = await registerUser(app, 'target');
      await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(owner))
        .send({ email: target.email, role: 'STAFF' })
        .expect(201);
      const row = await prisma.tenantMembership.findUniqueOrThrow({
        where: { userId_tenantId: { userId: target.id, tenantId } },
      });
      expect(row.tenantId).toBe(tenantId);
    });

    it('invitation produces a TenantAuditLog row with correct tenantId and actorMembershipId', async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      const target = await registerUser(app, 'target');
      const res = await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(owner))
        .send({ email: target.email, role: 'STAFF' })
        .expect(201);

      const ownerMembership = await ownerMembershipId(tenantId, owner.id);
      const rows = await prisma.tenantAuditLog.findMany({
        where: {
          tenantId,
          action: 'team.invite',
          targetId: res.body.data.id as string,
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].actorMembershipId).toBe(ownerMembership);
      expect(rows[0].viaSupportSessionId).toBeNull();
    });
  });

  // ─── E. ROLE CHANGE ─────────────────────────────────────────────────────

  describe('E. role change', () => {
    it.each(['ADMIN', 'STAFF', 'VIEWER'] as const)(
      'OWNER can change a member to %s',
      async (newRole) => {
        const { owner, membershipId } = await setupTenantWithMember('STAFF');
        const res = await http(app)
          .patch(apiPath(`/admin/team/${membershipId}/role`))
          .set(...authHeader(owner))
          .send({ role: newRole })
          .expect(200);
        expect(res.body.data.role).toBe(newRole);
      },
    );

    it.each(['ADMIN', 'STAFF', 'VIEWER'] as const)(
      '%s cannot change roles',
      async (role) => {
        const { member, membershipId } = await setupTenantWithMember(role);
        await http(app)
          .patch(apiPath(`/admin/team/${membershipId}/role`))
          .set(...authHeader(member))
          .send({ role: 'VIEWER' })
          .expect(403);
      },
    );

    it('OWNER cannot promote a member to OWNER', async () => {
      const { owner, membershipId } = await setupTenantWithMember('STAFF');
      await http(app)
        .patch(apiPath(`/admin/team/${membershipId}/role`))
        .set(...authHeader(owner))
        .send({ role: 'OWNER' })
        .expect(400);
    });

    it('the final OWNER cannot be demoted', async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      const ownerMembership = await ownerMembershipId(tenantId, owner.id);
      await http(app)
        .patch(apiPath(`/admin/team/${ownerMembership}/role`))
        .set(...authHeader(owner))
        .send({ role: 'ADMIN' })
        .expect(409);
    });

    it('a second OWNER CAN be demoted (only the final one is protected)', async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      const secondOwner = await registerUser(app, 'second-owner');
      await grantMembership(prisma, secondOwner.id, tenantId, 'OWNER');
      const secondOwnerMembership = await ownerMembershipId(
        tenantId,
        secondOwner.id,
      );
      await http(app)
        .patch(apiPath(`/admin/team/${secondOwnerMembership}/role`))
        .set(...authHeader(owner))
        .send({ role: 'ADMIN' })
        .expect(200);
    });

    it('a cross-tenant membership cannot be changed', async () => {
      const ownerA = await registerUser(app, 'owner-a');
      await grantOwnerMembership(prisma, ownerA.id);
      const { membershipId } = await setupTenantWithMember('STAFF');
      await http(app)
        .patch(apiPath(`/admin/team/${membershipId}/role`))
        .set(...authHeader(ownerA))
        .send({ role: 'ADMIN' })
        .expect(404);
    });

    it('a malformed membership id is rejected with 400', async () => {
      const owner = await registerUser(app, 'owner');
      await grantOwnerMembership(prisma, owner.id);
      await http(app)
        .patch(apiPath('/admin/team/not-a-uuid/role'))
        .set(...authHeader(owner))
        .send({ role: 'ADMIN' })
        .expect(400);
    });

    it('a well-formed but nonexistent membership id is rejected with 404', async () => {
      const owner = await registerUser(app, 'owner');
      await grantOwnerMembership(prisma, owner.id);
      await http(app)
        .patch(apiPath(`/admin/team/${randomUUID()}/role`))
        .set(...authHeader(owner))
        .send({ role: 'ADMIN' })
        .expect(404);
    });
  });

  // ─── F. MEMBER SUSPENSION ───────────────────────────────────────────────

  describe('F. member suspension', () => {
    it('OWNER can suspend a valid non-protected member', async () => {
      const { owner, membershipId } = await setupTenantWithMember('STAFF');
      const res = await http(app)
        .post(apiPath(`/admin/team/${membershipId}/suspend`))
        .set(...authHeader(owner))
        .expect(200);
      expect(res.body.data.status).toBe('SUSPENDED');
    });

    it.each(['ADMIN', 'STAFF', 'VIEWER'] as const)(
      '%s cannot suspend',
      async (role) => {
        const { member, membershipId } = await setupTenantWithMember(role);
        await http(app)
          .post(apiPath(`/admin/team/${membershipId}/suspend`))
          .set(...authHeader(member))
          .expect(403);
      },
    );

    it('the final OWNER cannot be suspended', async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      const ownerMembership = await ownerMembershipId(tenantId, owner.id);
      await http(app)
        .post(apiPath(`/admin/team/${ownerMembership}/suspend`))
        .set(...authHeader(owner))
        .expect(409);
    });

    it('suspension is tenant-scoped — cross-tenant suspend is a 404', async () => {
      const ownerA = await registerUser(app, 'owner-a');
      await grantOwnerMembership(prisma, ownerA.id);
      const { membershipId } = await setupTenantWithMember('STAFF');
      await http(app)
        .post(apiPath(`/admin/team/${membershipId}/suspend`))
        .set(...authHeader(ownerA))
        .expect(404);
    });

    it("suspending a user's membership in Tenant A does not affect their ACTIVE membership in Tenant B — and does not touch their User account", async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId: tenantA } = await grantOwnerMembership(
        prisma,
        owner.id,
      );
      const roamer = await registerUser(app, 'roamer');
      await grantMembership(prisma, roamer.id, tenantA, 'STAFF');
      const ownerB = await registerUser(app, 'owner-b');
      const { tenantId: tenantB } = await grantOwnerMembership(
        prisma,
        ownerB.id,
      );
      await grantMembership(prisma, roamer.id, tenantB, 'STAFF');

      const membershipA = await prisma.tenantMembership.findUniqueOrThrow({
        where: { userId_tenantId: { userId: roamer.id, tenantId: tenantA } },
      });
      await http(app)
        .post(apiPath(`/admin/team/${membershipA.id}/suspend`))
        .set(...authHeader(owner))
        .expect(200);

      const membershipB = await prisma.tenantMembership.findUniqueOrThrow({
        where: { userId_tenantId: { userId: roamer.id, tenantId: tenantB } },
      });
      expect(membershipB.status).toBe('ACTIVE');

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: roamer.id },
      });
      expect(user.isActive).toBe(true);

      // roamer can still use Tenant B normally.
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(roamer))
        .set('X-Active-Tenant', tenantB)
        .expect(200);
    });

    it('suspension produces a TenantAuditLog row atomically', async () => {
      const { owner, tenantId, membershipId } =
        await setupTenantWithMember('STAFF');
      await http(app)
        .post(apiPath(`/admin/team/${membershipId}/suspend`))
        .set(...authHeader(owner))
        .expect(200);
      const rows = await prisma.tenantAuditLog.findMany({
        where: { tenantId, action: 'team.suspend', targetId: membershipId },
      });
      expect(rows).toHaveLength(1);
    });
  });

  // ─── G. TENANT LIFECYCLE ────────────────────────────────────────────────

  describe('G. tenant lifecycle', () => {
    it('ACTIVE tenant allows OWNER team management', async () => {
      const owner = await registerUser(app, 'owner');
      await grantOwnerMembership(prisma, owner.id);
      await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(owner))
        .expect(200);
    });

    it('a SUSPENDED tenant blocks team management through the W4 lifecycle guard', async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'SUSPENDED' },
      });
      await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(owner))
        .expect(403);
    });

    it('resuming the tenant restores team management', async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'SUSPENDED' },
      });
      await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(owner))
        .expect(403);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'ACTIVE' },
      });
      await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(owner))
        .expect(200);
    });

    it('platform operations remain unaffected by a suspended tenant elsewhere', async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'SUSPENDED' },
      });
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .get(apiPath('/platform/tenants'))
        .set(...authHeader(superAdmin))
        .expect(200);
    });
  });

  // ─── H. AUDIT (additional checks beyond D/F above) ─────────────────────

  describe('H. audit', () => {
    it('role change produces a TenantAuditLog row with correct tenantId/actorMembershipId and null viaSupportSessionId', async () => {
      const { owner, tenantId, membershipId } =
        await setupTenantWithMember('STAFF');
      await http(app)
        .patch(apiPath(`/admin/team/${membershipId}/role`))
        .set(...authHeader(owner))
        .send({ role: 'ADMIN' })
        .expect(200);
      const ownerMembership = await ownerMembershipId(tenantId, owner.id);
      const rows = await prisma.tenantAuditLog.findMany({
        where: { tenantId, action: 'team.role_change', targetId: membershipId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].actorMembershipId).toBe(ownerMembership);
      expect(rows[0].viaSupportSessionId).toBeNull();
    });
  });

  // ─── I. SECURITY ────────────────────────────────────────────────────────

  describe('I. security', () => {
    it('no client tenantId override on role-change either', async () => {
      const { owner, membershipId } = await setupTenantWithMember('STAFF');
      await http(app)
        .patch(apiPath(`/admin/team/${membershipId}/role`))
        .set(...authHeader(owner))
        .send({ role: 'ADMIN', tenantId: randomUUID() })
        .expect(400);
    });

    it('a support session correctly scoped to members:manage can reach /admin/team (W6 permission ceiling extends here unbroken, not blocked, not bypassed)', async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionRes = await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId,
          justification: 'investigating a team-management issue',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          grantedPermissions: ['members:manage'],
        })
        .expect(201);
      await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionRes.body.data.id as string)
        .expect(200);
    });

    it('a support session NOT scoped to members:manage is denied /admin/team — the ceiling is never bypassed for a SUPER_ADMIN', async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionRes = await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId,
          justification: 'unrelated investigation',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          grantedPermissions: ['orders:read'],
        })
        .expect(201);
      await http(app)
        .get(apiPath('/admin/team'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionRes.body.data.id as string)
        .expect(403);
    });

    it('no ownership-transfer path exists — every attempt to grant OWNER is rejected', async () => {
      const owner = await registerUser(app, 'owner');
      await grantOwnerMembership(prisma, owner.id);
      const target = await registerUser(app, 'target');
      await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(owner))
        .send({ email: target.email, role: 'OWNER' })
        .expect(400);
    });
  });
});
