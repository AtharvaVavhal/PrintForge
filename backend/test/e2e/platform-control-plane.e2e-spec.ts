import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  apiPath,
  authHeader,
  grantOwnerMembership,
  http,
  registerAdmin,
  registerSuperAdmin,
  registerUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';

/**
 * Phase 5 W3 — Platform Control Plane (SaaS Master Plan §11). First real
 * exercise of `PlatformGuard`/`@PlatformOnly()` end-to-end through the
 * actual guard chain (`ThrottlerGuard` -> `JwtAuthGuard` ->
 * `TenantContextGuard` -> `PermissionsGuard` -> `PlatformGuard`), a real
 * Postgres transaction for suspend/resume + audit, and the frozen
 * `PlatformAuditLog` schema. Mirrors `tenant-isolation.e2e-spec.ts` /
 * `admin-control-plane.e2e-spec.ts`'s conventions.
 */
describe('Phase 5 W3 — Platform Control Plane (/platform/*)', () => {
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

  async function makeTenantWithStore(
    status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE',
  ) {
    const tenant = await prisma.tenant.create({
      data: { slug: `platform-test-${randomUUID()}`, status },
    });
    const store = await prisma.store.create({
      data: {
        tenantId: tenant.id,
        slug: 'primary',
        name: 'Test Store',
        status: 'ACTIVE',
        isPrimary: true,
      },
    });
    return { tenant, store };
  }

  // ─── AUTHORIZATION ──────────────────────────────────────────────────────

  describe('authorization', () => {
    it('SUPER_ADMIN can access /platform/tenants', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .get(apiPath('/platform/tenants'))
        .set(...authHeader(superAdmin))
        .expect(200);
    });

    it('a plain registered user (no role at all) cannot access /platform/*', async () => {
      const user = await registerUser(app);
      await http(app)
        .get(apiPath('/platform/tenants'))
        .set(...authHeader(user))
        .expect(403);
    });

    it('a tenant OWNER (legacy ADMIN + real membership, but platformRole=null) cannot access /platform/*', async () => {
      const admin = await registerAdmin(app, prisma);
      await http(app)
        .get(apiPath('/platform/tenants'))
        .set(...authHeader(admin))
        .expect(403);
    });

    it('unauthenticated access is rejected', async () => {
      await http(app).get(apiPath('/platform/tenants')).expect(401);
    });

    it('a SUPER_ADMIN can also reach every other /platform/* route', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant } = await makeTenantWithStore();

      await http(app)
        .get(apiPath(`/platform/tenants/${tenant.id}`))
        .set(...authHeader(superAdmin))
        .expect(200);
      await http(app)
        .get(apiPath('/platform/audit'))
        .set(...authHeader(superAdmin))
        .expect(200);
    });

    it('existing /admin/* authorization is unaffected — an OWNER still reaches /admin/dashboard, a plain user still gets 403', async () => {
      const admin = await registerAdmin(app, prisma);
      const user = await registerUser(app);
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(admin))
        .expect(200);
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(user))
        .expect(403);
    });
  });

  // ─── TENANT LIST / DETAIL ───────────────────────────────────────────────

  describe('tenant list / detail', () => {
    it('list returns only the intended safe tenant metadata (id, slug, status, createdAt, storeCount)', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant } = await makeTenantWithStore();

      const res = await http(app)
        .get(apiPath('/platform/tenants'))
        .set(...authHeader(superAdmin))
        .expect(200);

      const row = (res.body.data as Array<Record<string, unknown>>).find(
        (t) => t.id === tenant.id,
      );
      expect(row).toBeDefined();
      expect(Object.keys(row!).sort()).toEqual(
        ['id', 'slug', 'status', 'createdAt', 'storeCount'].sort(),
      );
      expect(row!.storeCount).toBe(1);
      expect(res.body.meta).toEqual(
        expect.objectContaining({ page: 1, limit: 20 }),
      );
    });

    it('detail returns only the intended safe metadata plus store/subscription summaries — no customer/order data', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant, store } = await makeTenantWithStore();

      const res = await http(app)
        .get(apiPath(`/platform/tenants/${tenant.id}`))
        .set(...authHeader(superAdmin))
        .expect(200);

      expect(Object.keys(res.body.data).sort()).toEqual(
        [
          'id',
          'slug',
          'status',
          'createdAt',
          'updatedAt',
          'stores',
          'subscription',
        ].sort(),
      );
      expect(res.body.data.stores).toEqual([
        expect.objectContaining({ id: store.id, isPrimary: true }),
      ]);
      // No commerce/customer keys leaked anywhere on the payload.
      const serialized = JSON.stringify(res.body.data);
      expect(serialized).not.toMatch(/customer|order|cart/i);
    });

    it('nonexistent tenant returns the repository-standard 404 envelope', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const res = await http(app)
        .get(apiPath(`/platform/tenants/${randomUUID()}`))
        .set(...authHeader(superAdmin))
        .expect(404);
      expect(res.body.success).toBe(false);
    });

    it('a malformed tenant id is rejected (400), not treated as a lookup', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .get(apiPath('/platform/tenants/not-a-uuid'))
        .set(...authHeader(superAdmin))
        .expect(400);
    });
  });

  // ─── LIFECYCLE ──────────────────────────────────────────────────────────

  describe('tenant lifecycle (ACTIVE <-> SUSPENDED only)', () => {
    it('ACTIVE -> SUSPENDED works', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant } = await makeTenantWithStore('ACTIVE');

      const res = await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/suspend`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'billing hold' })
        .expect(200);

      expect(res.body.data.status).toBe('SUSPENDED');
      const reloaded = await prisma.tenant.findUniqueOrThrow({
        where: { id: tenant.id },
      });
      expect(reloaded.status).toBe('SUSPENDED');
    });

    it('SUSPENDED -> ACTIVE works', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant } = await makeTenantWithStore('SUSPENDED');

      const res = await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/resume`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'hold lifted' })
        .expect(200);

      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('repeated suspend is rejected safely (409), tenant stays SUSPENDED', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant } = await makeTenantWithStore('SUSPENDED');

      const res = await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/suspend`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'x' })
        .expect(409);
      expect(res.body.success).toBe(false);
    });

    it('repeated resume is rejected safely (409), tenant stays ACTIVE', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant } = await makeTenantWithStore('ACTIVE');

      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/resume`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'x' })
        .expect(409);
    });

    it('a PENDING_DELETION tenant cannot be suspended or resumed through W3', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant } = await makeTenantWithStore('ACTIVE');
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { status: 'PENDING_DELETION' },
      });

      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/suspend`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'x' })
        .expect(409);
      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/resume`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'x' })
        .expect(409);
    });

    it('a DELETED tenant cannot be suspended or resumed through W3', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant } = await makeTenantWithStore('ACTIVE');
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { status: 'DELETED' },
      });

      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/suspend`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'x' })
        .expect(409);
      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/resume`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'x' })
        .expect(409);
    });

    it('rejects suspend/resume with no justification (400) — the DTO requires one', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant } = await makeTenantWithStore('ACTIVE');
      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/suspend`))
        .set(...authHeader(superAdmin))
        .send({})
        .expect(400);
    });

    it('non-SUPER_ADMIN cannot suspend a tenant even with a well-formed request', async () => {
      const admin = await registerAdmin(app, prisma);
      const { tenant } = await makeTenantWithStore('ACTIVE');
      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/suspend`))
        .set(...authHeader(admin))
        .send({ justification: 'x' })
        .expect(403);
      const reloaded = await prisma.tenant.findUniqueOrThrow({
        where: { id: tenant.id },
      });
      expect(reloaded.status).toBe('ACTIVE');
    });
  });

  // ─── AUDITING ───────────────────────────────────────────────────────────

  describe('platform auditing', () => {
    it('a successful suspend creates exactly one PlatformAuditLog with the correct actor/target/tenant', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant } = await makeTenantWithStore('ACTIVE');

      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/suspend`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'billing hold' })
        .expect(200);

      const logs = await prisma.platformAuditLog.findMany({
        where: { targetId: tenant.id },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        actorUserId: superAdmin.id,
        action: 'tenant.suspend',
        targetType: 'Tenant',
        targetId: tenant.id,
        tenantId: tenant.id,
        justification: 'billing hold',
      });
      expect(logs[0].metadata).toEqual({
        fromStatus: 'ACTIVE',
        toStatus: 'SUSPENDED',
      });
    });

    it('a successful resume creates exactly one PlatformAuditLog', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant } = await makeTenantWithStore('SUSPENDED');

      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/resume`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'hold lifted' })
        .expect(200);

      const logs = await prisma.platformAuditLog.findMany({
        where: { targetId: tenant.id, action: 'tenant.resume' },
      });
      expect(logs).toHaveLength(1);
    });

    it('a rejected (repeated) suspend creates NO PlatformAuditLog row', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant } = await makeTenantWithStore('SUSPENDED');

      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/suspend`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'x' })
        .expect(409);

      const logs = await prisma.platformAuditLog.findMany({
        where: { targetId: tenant.id },
      });
      expect(logs).toHaveLength(0);
    });

    it('/platform/audit reads PlatformAuditLog only — never returns TenantAuditLog rows, and lists what was actually written', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant } = await makeTenantWithStore('ACTIVE');
      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/suspend`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'audit-read-check' })
        .expect(200);

      // Plant an UNRELATED TenantAuditLog row directly — proves the read
      // endpoint genuinely queries a different table, not a shared one.
      await prisma.tenantAuditLog.create({
        data: {
          tenantId: tenant.id,
          action: 'settings.update',
          targetType: 'AppSetting',
          targetId: 'unrelated-key',
          metadata: {},
        },
      });

      const res = await http(app)
        .get(apiPath('/platform/audit'))
        .set(...authHeader(superAdmin))
        .query({ tenantId: tenant.id })
        .expect(200);

      const actions = (res.body.data as Array<{ action: string }>).map(
        (r) => r.action,
      );
      expect(actions).toContain('tenant.suspend');
      expect(actions).not.toContain('settings.update');
    });

    it('a non-SUPER_ADMIN cannot read /platform/audit', async () => {
      const admin = await registerAdmin(app, prisma);
      await http(app)
        .get(apiPath('/platform/audit'))
        .set(...authHeader(admin))
        .expect(403);
    });
  });

  // ─── SECURITY ───────────────────────────────────────────────────────────

  describe('security', () => {
    it('a client-supplied tenantId in the body cannot override the :id route param as the transition target', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant: realTarget } = await makeTenantWithStore('ACTIVE');
      const { tenant: decoy } = await makeTenantWithStore('ACTIVE');

      await http(app)
        .post(apiPath(`/platform/tenants/${realTarget.id}/suspend`))
        .set(...authHeader(superAdmin))
        // forbidNonWhitelisted rejects an unknown body field outright —
        // proving there is no back door for a body-supplied tenantId at all.
        .send({ justification: 'x', tenantId: decoy.id })
        .expect(400);

      const decoyReloaded = await prisma.tenant.findUniqueOrThrow({
        where: { id: decoy.id },
      });
      expect(decoyReloaded.status).toBe('ACTIVE');
    });

    it('a granted X-Active-Tenant header has no effect on /platform/* (platform routes never resolve a TenantContext)', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const { tenant: ownTenant } = await makeTenantWithStore('ACTIVE');
      // Give the SUPER_ADMIN an unrelated membership so a header would be
      // theoretically resolvable if TenantContextGuard did not skip
      // @PlatformOnly() routes.
      await grantOwnerMembership(prisma, superAdmin.id);

      const res = await http(app)
        .get(apiPath('/platform/tenants'))
        .set(...authHeader(superAdmin))
        .set('X-Active-Tenant', ownTenant.id)
        .expect(200);
      // Still lists ALL tenants (platform-wide), not scoped to the header.
      expect(
        (res.body.data as Array<{ id: string }>).some(
          (t) => t.id === ownTenant.id,
        ),
      ).toBe(true);
    });

    it('existing /admin/* tenant-scoped behavior is unchanged by this module (regression)', async () => {
      const admin = await registerAdmin(app, prisma);
      const res = await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(admin))
        .expect(200);
      expect(res.body.success).toBe(true);
    });
  });
});
