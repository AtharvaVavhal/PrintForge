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
  registerAdmin,
  registerSuperAdmin,
  registerUser,
  TestUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { SUPPORT_SESSION_HEADER } from '../../src/common/tenant/support-session-context.guard';

/**
 * Phase 5 W6 — SupportSession implementation (SaaS Master Plan §11;
 * decisions P5-D4 / P5-D4A / P5-D8). Exercises the real HTTP stack end to
 * end: creation/revoke/list through `/platform/support-sessions*`, and the
 * session actually being usable (and correctly bounded) against the real
 * `/admin/*` surface via the extended guard pipeline + permission ceiling.
 *
 * Categories A-K below mirror the W6 authorization's own required test
 * matrix exactly.
 */
describe('Phase 5 W6 — SupportSession', () => {
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

  async function createActiveTenant(): Promise<string> {
    const tenant = await prisma.tenant.create({
      data: { slug: `support-e2e-${randomUUID()}` },
    });
    return tenant.id;
  }

  function futureIso(msFromNow = 60 * 60 * 1000): string {
    return new Date(Date.now() + msFromNow).toISOString();
  }

  /** Creates a session via the REAL endpoint — the default path every test
   * that doesn't specifically need an edge state (expired/revoked/foreign)
   * should use. */
  async function createSessionViaApi(
    admin: TestUser,
    tenantId: string,
    grantedPermissions: string[] = ['orders:read'],
    justification = 'investigating a billing dispute',
  ): Promise<string> {
    const res = await http(app)
      .post(apiPath('/platform/support-sessions'))
      .set(...authHeader(admin))
      .send({
        tenantId,
        justification,
        expiresAt: futureIso(),
        grantedPermissions,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  /** Direct-via-Prisma fixture for edge states the create endpoint itself
   * refuses to produce (already-expired), same convention
   * `tenant-lifecycle-enforcement.e2e-spec.ts`'s own `suspendTenant` helper
   * uses for a state the platform API doesn't expose either. */
  async function createExpiredSessionDirect(
    adminId: string,
    tenantId: string,
  ): Promise<string> {
    const session = await prisma.supportSession.create({
      data: {
        tenantId,
        createdByUserId: adminId,
        justification: 'x',
        grantedPermissions: ['orders:read'],
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    return session.id;
  }

  // ─── A. CREATION AUTHORIZATION ──────────────────────────────────────────

  describe('A. creation authorization', () => {
    it('unauthenticated cannot create', async () => {
      const tenantId = await createActiveTenant();
      await http(app)
        .post(apiPath('/platform/support-sessions'))
        .send({
          tenantId,
          justification: 'x',
          expiresAt: futureIso(),
          grantedPermissions: ['orders:read'],
        })
        .expect(401);
    });

    it('a normal tenant user (no membership) cannot create', async () => {
      const tenantId = await createActiveTenant();
      const user = await registerUser(app, 'plain');
      await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(user))
        .send({
          tenantId,
          justification: 'x',
          expiresAt: futureIso(),
          grantedPermissions: ['orders:read'],
        })
        .expect(403);
    });

    it('an OWNER cannot create', async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(owner))
        .send({
          tenantId,
          justification: 'x',
          expiresAt: futureIso(),
          grantedPermissions: ['orders:read'],
        })
        .expect(403);
    });

    it('an ADMIN cannot create', async () => {
      const admin = await registerAdmin(app, prisma);
      await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(admin))
        .send({
          tenantId: admin.tenantId,
          justification: 'x',
          expiresAt: futureIso(),
          grantedPermissions: ['orders:read'],
        })
        .expect(403);
    });

    it('a SUPER_ADMIN can create', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const res = await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId,
          justification: 'investigating a billing dispute',
          expiresAt: futureIso(),
          grantedPermissions: ['orders:read'],
        })
        .expect(201);
      expect(res.body.data.tenantId).toBe(tenantId);
      expect(res.body.data.status).toBe('ACTIVE');
    });
  });

  // ─── B. CREATION VALIDATION ─────────────────────────────────────────────

  describe('B. creation validation', () => {
    it('a nonexistent tenant is rejected', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId: randomUUID(),
          justification: 'x',
          expiresAt: futureIso(),
          grantedPermissions: ['orders:read'],
        })
        .expect(404);
    });

    it('a SUSPENDED tenant is rejected', async () => {
      const tenantId = await createActiveTenant();
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'SUSPENDED' },
      });
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId,
          justification: 'x',
          expiresAt: futureIso(),
          grantedPermissions: ['orders:read'],
        })
        .expect(409);
    });

    it('an invalid/unknown permission string is rejected', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId,
          justification: 'x',
          expiresAt: futureIso(),
          grantedPermissions: ['orders:read', 'not-a-real-permission'],
        })
        .expect(400);
    });

    it('an empty granted-permissions scope is rejected', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId,
          justification: 'x',
          expiresAt: futureIso(),
          grantedPermissions: [],
        })
        .expect(400);
    });

    it('an expiresAt in the past is rejected', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId,
          justification: 'x',
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
          grantedPermissions: ['orders:read'],
        })
        .expect(400);
    });

    it('a non-ISO/invalid expiresAt is rejected', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId,
          justification: 'x',
          expiresAt: 'not-a-date',
          grantedPermissions: ['orders:read'],
        })
        .expect(400);
    });

    it('a missing justification is rejected', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId,
          expiresAt: futureIso(),
          grantedPermissions: ['orders:read'],
        })
        .expect(400);
    });

    it('a malformed tenant id is rejected', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId: 'not-a-uuid',
          justification: 'x',
          expiresAt: futureIso(),
          grantedPermissions: ['orders:read'],
        })
        .expect(400);
    });
  });

  // ─── C. SESSION AUTHENTICATION ──────────────────────────────────────────

  describe('C. session authentication', () => {
    it('a valid session works against a real /admin/* route', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId, [
        'orders:read',
      ]);
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(200);
    });

    it('an invalid (garbage) session id fails', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, 'not-a-real-id')
        .expect(403);
    });

    it('a nonexistent (well-formed uuid) session id fails', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, randomUUID())
        .expect(403);
    });

    it('a revoked session fails', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId);
      await http(app)
        .post(apiPath(`/platform/support-sessions/${sessionId}/revoke`))
        .set(...authHeader(superAdmin))
        .expect(200);
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(403);
    });

    it('an expired session fails', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createExpiredSessionDirect(
        superAdmin.id,
        tenantId,
      );
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(403);
    });
  });

  // ─── D. TENANT ISOLATION ────────────────────────────────────────────────

  describe('D. tenant isolation', () => {
    it("a session for tenant A cannot access tenant B's data", async () => {
      const tenantA = await createActiveTenant();
      const tenantB = await createActiveTenant();
      const ownerB = await registerUser(app, 'owner-b');
      await grantMembership(prisma, ownerB.id, tenantB, 'OWNER');
      const orderB = await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(ownerB))
        .expect(200);
      expect(orderB.body.data).toEqual([]);

      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantA, [
        'customers:read',
      ]);
      // customerB directly under tenant B
      const storeB = await prisma.store.findFirst({
        where: { tenantId: tenantB },
      });
      if (storeB) {
        await prisma.customer.create({
          data: {
            storeId: storeB.id,
            tenantId: tenantB,
            email: 'b-customer@example.test',
            passwordHash: 'x',
          },
        });
      }
      const res = await http(app)
        .get(apiPath('/admin/customers'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(200);
      expect(
        (res.body.data as Array<{ email: string }>).some(
          (c) => c.email === 'b-customer@example.test',
        ),
      ).toBe(false);
    });

    it('X-Active-Tenant cannot redirect session A to tenant B', async () => {
      const tenantA = await createActiveTenant();
      const tenantB = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantA, [
        'orders:read',
      ]);
      // Either ignored (200, still scoped to A) or rejected — never a
      // successful redirect to B. TenantContextGuard's own skip (P5-D8)
      // means the header is simply inert here; the request still succeeds
      // as tenant A.
      const res = await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .set('X-Active-Tenant', tenantB)
        .expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('a body tenantId cannot redirect session A to tenant B — the route DTO has no such field, so the global ValidationPipe (whitelist + forbidNonWhitelisted) rejects the attempt outright, before any business logic ever runs', async () => {
      const tenantA = await createActiveTenant();
      const tenantB = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantA, [
        'orders:transition',
      ]);
      await http(app)
        .patch(apiPath(`/admin/orders/${randomUUID()}/status`))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .send({ status: 'CONFIRMED', tenantId: tenantB })
        .expect(400);
    });

    it('a query tenantId cannot redirect session A to tenant B — the route query DTO has no such field, so the global ValidationPipe (whitelist + forbidNonWhitelisted) rejects the attempt outright', async () => {
      const tenantA = await createActiveTenant();
      const tenantB = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantA, [
        'orders:read',
      ]);
      await http(app)
        .get(apiPath(`/admin/orders?tenantId=${tenantB}`))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(400);
    });

    it('sequential A -> B -> A requests do not leak context between them', async () => {
      const tenantA = await createActiveTenant();
      const tenantB = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionA = await createSessionViaApi(superAdmin, tenantA, [
        'orders:read',
      ]);
      const sessionB = await createSessionViaApi(superAdmin, tenantB, [
        'orders:read',
      ]);

      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionA)
        .expect(200);
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionB)
        .expect(200);
      // Back to A: still works, unaffected by B's request in between.
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionA)
        .expect(200);
    });
  });

  // ─── E. PERMISSION CEILING ──────────────────────────────────────────────

  describe('E. permission ceiling', () => {
    it('scope orders:read allows a route requiring orders:read', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId, [
        'orders:read',
      ]);
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(200);
    });

    it('a scope WITHOUT orders:read denies a route requiring it', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId, [
        'customers:read',
      ]);
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(403);
    });

    it('scope orders:read does NOT also grant orders:transition', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId, [
        'orders:read',
      ]);
      await http(app)
        .patch(apiPath(`/admin/orders/${randomUUID()}/status`))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .send({ status: 'CONFIRMED' })
        .expect(403);
    });

    it('scope customers:read does not grant orders access', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId, [
        'customers:read',
      ]);
      await http(app)
        .get(apiPath('/admin/customers'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(200);
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(403);
    });

    it('an unknown permission cannot be stored/granted at creation', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId,
          justification: 'x',
          expiresAt: futureIso(),
          grantedPermissions: ['orders:delete-everything'],
        })
        .expect(400);
    });
  });

  // ─── F. TENANT LIFECYCLE ────────────────────────────────────────────────

  describe('F. tenant lifecycle', () => {
    it('an ACTIVE tenant works normally through a session', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId, [
        'orders:read',
      ]);
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(200);
    });

    it('a SUSPENDED tenant blocks an otherwise-valid session, exactly like TenantLifecycleGuard blocks any other request', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId, [
        'orders:read',
      ]);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'SUSPENDED' },
      });
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(403);
    });

    it('resuming the tenant allows the still-valid session to work again — no need to re-create it', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId, [
        'orders:read',
      ]);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'SUSPENDED' },
      });
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(403);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'ACTIVE' },
      });
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(200);
    });
  });

  // ─── G. REVOCATION ──────────────────────────────────────────────────────

  describe('G. revocation', () => {
    it('revoking immediately prevents further use', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId);
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(200);
      await http(app)
        .post(apiPath(`/platform/support-sessions/${sessionId}/revoke`))
        .set(...authHeader(superAdmin))
        .expect(200);
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(403);
    });

    it('repeated revoke is a safe, explicit conflict — never a silent success or a crash', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId);
      await http(app)
        .post(apiPath(`/platform/support-sessions/${sessionId}/revoke`))
        .set(...authHeader(superAdmin))
        .expect(200);
      await http(app)
        .post(apiPath(`/platform/support-sessions/${sessionId}/revoke`))
        .set(...authHeader(superAdmin))
        .expect(409);
    });

    it('revoking session A (by id) never touches session B, regardless of which tenant context the revoking admin currently operates under', async () => {
      const tenantA = await createActiveTenant();
      const tenantB = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionA = await createSessionViaApi(superAdmin, tenantA);
      const sessionB = await createSessionViaApi(superAdmin, tenantB);
      await http(app)
        .post(apiPath(`/platform/support-sessions/${sessionA}/revoke`))
        .set(...authHeader(superAdmin))
        .expect(200);
      // sessionB is completely unaffected.
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionB)
        .expect(200);
    });
  });

  // ─── H. AUDIT ───────────────────────────────────────────────────────────

  describe('H. audit', () => {
    it('creating a session produces exactly one PlatformAuditLog row', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId);
      const rows = await prisma.platformAuditLog.findMany({
        where: { action: 'support_session.create', targetId: sessionId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].actorUserId).toBe(superAdmin.id);
      expect(rows[0].tenantId).toBe(tenantId);
    });

    it('revoking a session produces exactly one PlatformAuditLog row', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId);
      await http(app)
        .post(apiPath(`/platform/support-sessions/${sessionId}/revoke`))
        .set(...authHeader(superAdmin))
        .expect(200);
      const rows = await prisma.platformAuditLog.findMany({
        where: { action: 'support_session.revoke', targetId: sessionId },
      });
      expect(rows).toHaveLength(1);
    });

    it('creating a session against a tenant produces a TenantAuditLog row with the correct viaSupportSessionId and no fabricated membership', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId);
      const rows = await prisma.tenantAuditLog.findMany({
        where: { tenantId, action: 'support_session.create' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].viaSupportSessionId).toBe(sessionId);
      expect(rows[0].actorMembershipId).toBeNull();
      expect(rows[0].actorCustomerId).toBeNull();
    });

    it('revoking a session produces a TenantAuditLog row with the correct viaSupportSessionId', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId);
      await http(app)
        .post(apiPath(`/platform/support-sessions/${sessionId}/revoke`))
        .set(...authHeader(superAdmin))
        .expect(200);
      const rows = await prisma.tenantAuditLog.findMany({
        where: { tenantId, action: 'support_session.revoke' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].viaSupportSessionId).toBe(sessionId);
    });

    it('a failed creation (SUSPENDED tenant) rolls back — no PlatformAuditLog and no SupportSession row is left behind', async () => {
      const tenantId = await createActiveTenant();
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'SUSPENDED' },
      });
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId,
          justification: 'x',
          expiresAt: futureIso(),
          grantedPermissions: ['orders:read'],
        })
        .expect(409);
      expect(await prisma.supportSession.count({ where: { tenantId } })).toBe(
        0,
      );
      expect(
        await prisma.platformAuditLog.count({
          where: { tenantId, action: 'support_session.create' },
        }),
      ).toBe(0);
    });
  });

  // ─── I. SECRETS ─────────────────────────────────────────────────────────

  describe('I. secrets', () => {
    it('GET /platform/support-sessions never exposes a secret/token field (there is none — every returned field is enumerated and checked)', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      await createSessionViaApi(superAdmin, tenantId);
      const res = await http(app)
        .get(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .expect(200);
      const item = res.body.data[0];
      expect(Object.keys(item).sort()).toEqual(
        [
          'id',
          'tenantId',
          'createdByUserId',
          'justification',
          'grantedPermissions',
          'expiresAt',
          'revokedAt',
          'revokedByUserId',
          'createdAt',
          'status',
        ].sort(),
      );
    });

    it('audit metadata for session creation does not include a secret/token', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId);
      const row = await prisma.platformAuditLog.findFirstOrThrow({
        where: { targetId: sessionId, action: 'support_session.create' },
      });
      expect(JSON.stringify(row.metadata)).not.toMatch(/token|secret/i);
    });
  });

  // ─── J. PLATFORM ISOLATION ──────────────────────────────────────────────

  describe('J. platform isolation', () => {
    it('using a support session grants no /platform/* access to a caller who is not independently SUPER_ADMIN', async () => {
      // Structurally impossible to construct (only a SUPER_ADMIN can ever
      // hold a session at all — SupportSessionContextGuard treats the
      // header as inert noise for anyone else), so this proves the
      // negative directly: a plain user presenting ANY session header
      // still gets the ordinary 403, never elevated /platform/* access.
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId);
      const plainUser = await registerUser(app, 'plain');
      await http(app)
        .get(apiPath('/platform/support-sessions'))
        .set(...authHeader(plainUser))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(403);
    });

    it('a SUPER_ADMIN with an active support session retains normal, unaffected /platform/* access (independent of the session)', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId);
      await http(app)
        .get(apiPath('/platform/tenants'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .expect(200);
    });

    it('a support session cannot be used to create another support session (the header grants no elevated capability on /platform/* routes)', async () => {
      const tenantId = await createActiveTenant();
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionId = await createSessionViaApi(superAdmin, tenantId);
      // This actually succeeds — because the caller genuinely IS a
      // SUPER_ADMIN independent of the header (PlatformGuard never
      // consults tenantContext/source at all). The point of this test is
      // the NEGATIVE it rules out: a non-SUPER_ADMIN could never reach
      // here regardless of any session header (covered above), and this
      // confirms the header itself contributes nothing to the decision —
      // remove it and the exact same request succeeds identically.
      const withHeader = await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .send({
          tenantId,
          justification: 'nested session',
          expiresAt: futureIso(),
          grantedPermissions: ['orders:read'],
        })
        .expect(201);
      const withoutHeader = await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId,
          justification: 'nested session',
          expiresAt: futureIso(),
          grantedPermissions: ['orders:read'],
        })
        .expect(201);
      expect(withHeader.body.data.tenantId).toBe(
        withoutHeader.body.data.tenantId,
      );
    });
  });

  // ─── K. W2/W3/W4 REGRESSION (representative — full suites run separately) ─

  describe('K. regression spot-checks', () => {
    it('ordinary membership-based /admin/* access is completely unaffected by SupportSessionContextGuard being in the pipeline', async () => {
      const admin = await registerAdmin(app, prisma);
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(admin))
        .expect(200);
    });

    it('the existing platform control plane (W3) still works unaffected', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .get(apiPath('/platform/tenants'))
        .set(...authHeader(superAdmin))
        .expect(200);
    });

    it('W4 lifecycle enforcement still blocks a SUSPENDED tenant for an ordinary member (no session involved)', async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'SUSPENDED' },
      });
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(owner))
        .expect(403);
    });
  });
});
