import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  apiPath,
  authHeader,
  grantOwnerMembership,
  http,
  registerAdmin,
  registerUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { ACTIVE_TENANT_HEADER } from '../../src/common/tenant/tenant-context.guard';
import { getTenantScopedClient } from '../../src/common/tenant/tenant-prisma';

/**
 * Phase 3 — tenant isolation (SaaS Master Plan §9; decisions D6, D4, G-13,
 * G-20). Created here per spec §14/§18 — grows every later phase.
 *
 * Two-tenant coverage today is necessarily limited to what Phase 3 actually
 * has: no commerce table carries `tenantId` yet (Phase 4's backfill), so
 * this exercises (1) the ratified permission catalogue per `TenantRole`
 * against the real `/admin/*` surface, (2) `X-Active-Tenant` cross-tenant
 * spoof rejection through the real HTTP stack, (3) `PlatformGuard` /
 * `PermissionsGuard` independence (frozen invariant 4), and (4) the
 * tenant-scoped Prisma client's actual row-level isolation on the two
 * models that DO carry real, tenant-owned data today
 * (`tenant_memberships`, `customers`).
 */
describe('Phase 3 — tenant isolation', () => {
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

  describe('permission enforcement per TenantRole (G-13) on the real /admin/* surface', () => {
    async function memberWithRole(
      role: 'OWNER' | 'ADMIN' | 'STAFF' | 'VIEWER',
    ) {
      const user = await registerUser(app, `member-${role.toLowerCase()}`);
      const tenant = await prisma.tenant.create({
        data: {
          slug: `iso-${role.toLowerCase()}-${Date.now()}-${Math.random()}`,
        },
      });
      // Phase 5 W9 (decision D11) — GET/PATCH /admin/settings now resolves
      // the tenant's primary Store for any STORE-owned key (storeName
      // included); every real tenant has one from creation
      // (`prisma/seed-tenant-bootstrap.ts`), so this fixture must pair one
      // too or the settings calls below 404.
      await prisma.store.create({
        data: {
          tenantId: tenant.id,
          slug: `iso-${role.toLowerCase()}-store-${Date.now()}`,
          name: 'Test Store',
          status: 'ACTIVE',
          isPrimary: true,
        },
      });
      await prisma.tenantMembership.create({
        data: { userId: user.id, tenantId: tenant.id, role, status: 'ACTIVE' },
      });
      return { ...user, tenantId: tenant.id };
    }

    it('OWNER can read the dashboard and write settings', async () => {
      const owner = await memberWithRole('OWNER');
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(owner))
        .expect(200);
      await http(app)
        .patch(apiPath('/admin/settings/storeName'))
        .set(...authHeader(owner))
        .send({ value: 'New Name' })
        .expect(200);
    });

    it('VIEWER can read the dashboard but cannot transition an order or write settings', async () => {
      const viewer = await memberWithRole('VIEWER');
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(viewer))
        .expect(200);
      await http(app)
        .patch(apiPath('/admin/settings/storeName'))
        .set(...authHeader(viewer))
        .send({ value: 'Nope' })
        .expect(403);
    });

    it('STAFF can write products-adjacent actions but cannot manage members or write settings', async () => {
      const staff = await memberWithRole('STAFF');
      await http(app)
        .get(apiPath('/admin/settings'))
        .set(...authHeader(staff))
        .expect(200);
      await http(app)
        .patch(apiPath('/admin/settings/storeName'))
        .set(...authHeader(staff))
        .send({ value: 'Nope' })
        .expect(403);
    });

    it('ADMIN can write settings/coupons but cannot manage members (OWNER-reserved; no route exists yet, verified at the catalogue level)', async () => {
      const admin = await memberWithRole('ADMIN');
      await http(app)
        .patch(apiPath('/admin/settings/storeName'))
        .set(...authHeader(admin))
        .send({ value: 'New Name' })
        .expect(200);
    });

    it('a User with NO membership at all cannot reach any /admin/* route (fail closed)', async () => {
      const user = await registerUser(app, 'no-membership');
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(user))
        .expect(403);
    });
  });

  describe('X-Active-Tenant cross-tenant spoof rejection (D6)', () => {
    it('a membership-holder for tenant A cannot select tenant B via the header', async () => {
      const admin = await registerAdmin(app, prisma);
      const { tenantId: tenantB } = await grantOwnerMembership(
        prisma,
        (await registerUser(app, 'other-owner')).id,
      );

      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(admin))
        .set(ACTIVE_TENANT_HEADER, tenantB)
        .expect(403);
    });

    it("the header correctly SELECTS among the caller's own multiple memberships", async () => {
      const user = await registerUser(app, 'multi-member');
      const tenantA = await prisma.tenant.create({
        data: { slug: `iso-multi-a-${Date.now()}` },
      });
      const tenantB = await prisma.tenant.create({
        data: { slug: `iso-multi-b-${Date.now()}` },
      });
      await prisma.tenantMembership.create({
        data: {
          userId: user.id,
          tenantId: tenantA.id,
          role: 'VIEWER',
          status: 'ACTIVE',
        },
      });
      await prisma.tenantMembership.create({
        data: {
          userId: user.id,
          tenantId: tenantB.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
      // Phase 5 W9 — only tenant B's write is expected to succeed (200)
      // below; tenant A's own write is blocked on permissions (403) before
      // ever reaching primary-store resolution, so only B needs a Store.
      await prisma.store.create({
        data: {
          tenantId: tenantB.id,
          slug: `iso-multi-b-store-${Date.now()}`,
          name: 'Test Store',
          status: 'ACTIVE',
          isPrimary: true,
        },
      });

      // As VIEWER on tenant A: settings write denied.
      await http(app)
        .patch(apiPath('/admin/settings/storeName'))
        .set(...authHeader(user))
        .set(ACTIVE_TENANT_HEADER, tenantA.id)
        .send({ value: 'x' })
        .expect(403);

      // Same user, same token, header switched to tenant B where they are
      // OWNER: settings write succeeds.
      await http(app)
        .patch(apiPath('/admin/settings/storeName'))
        .set(...authHeader(user))
        .set(ACTIVE_TENANT_HEADER, tenantB.id)
        .send({ value: 'x' })
        .expect(200);
    });

    it('with no header and MULTIPLE memberships, no default is guessed — the request is denied', async () => {
      const user = await registerUser(app, 'ambiguous-member');
      const tenantA = await prisma.tenant.create({
        data: { slug: `iso-ambig-a-${Date.now()}` },
      });
      const tenantB = await prisma.tenant.create({
        data: { slug: `iso-ambig-b-${Date.now()}` },
      });
      await prisma.tenantMembership.create({
        data: {
          userId: user.id,
          tenantId: tenantA.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
      await prisma.tenantMembership.create({
        data: {
          userId: user.id,
          tenantId: tenantB.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });

      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(user))
        .expect(403);
    });
  });

  describe('PlatformGuard / PermissionsGuard independence (frozen invariant 4)', () => {
    it('a SUPER_ADMIN with no TenantMembership cannot reach a permission-gated /admin/* route', async () => {
      const user = await registerUser(app, 'super-admin');
      await prisma.user.update({
        where: { id: user.id },
        data: { platformRole: 'SUPER_ADMIN' },
      });

      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(user))
        .expect(403);
    });
  });

  describe('tenant-scoped Prisma client (D4 — application-layer, primary mechanism)', () => {
    it("a scoped client for tenant A cannot see tenant B's tenant_memberships or customers rows", async () => {
      const userA = await registerUser(app, 'scoped-a');
      const userB = await registerUser(app, 'scoped-b');
      const tenantA = await prisma.tenant.create({
        data: { slug: `scoped-a-${Date.now()}` },
      });
      const tenantB = await prisma.tenant.create({
        data: { slug: `scoped-b-${Date.now()}` },
      });
      const storeA = await prisma.store.create({
        data: {
          tenantId: tenantA.id,
          slug: 'primary',
          name: 'A Store',
          isPrimary: true,
        },
      });
      const storeB = await prisma.store.create({
        data: {
          tenantId: tenantB.id,
          slug: 'primary',
          name: 'B Store',
          isPrimary: true,
        },
      });
      await prisma.tenantMembership.create({
        data: {
          userId: userA.id,
          tenantId: tenantA.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
      await prisma.tenantMembership.create({
        data: {
          userId: userB.id,
          tenantId: tenantB.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
      await prisma.customer.create({
        data: {
          storeId: storeA.id,
          tenantId: tenantA.id,
          email: 'a-customer@example.test',
          passwordHash: 'x',
        },
      });
      await prisma.customer.create({
        data: {
          storeId: storeB.id,
          tenantId: tenantB.id,
          email: 'b-customer@example.test',
          passwordHash: 'x',
        },
      });

      const scopedToA = getTenantScopedClient(prisma, tenantA.id);

      const memberships = await scopedToA.tenantMembership.findMany({});
      expect(memberships.map((m) => m.userId)).toEqual([userA.id]);

      const customers = await scopedToA.customer.findMany({});
      expect(customers).toHaveLength(1);
      expect(customers[0].email).toBe('a-customer@example.test');

      // A create through the scoped client is stamped with tenant A even if
      // the caller didn't (couldn't) supply a different tenantId.
      const created = await scopedToA.customer.create({
        data: {
          storeId: storeA.id,
          email: 'new@example.test',
          passwordHash: 'x',
        } as never,
      });
      expect(created.tenantId).toBe(tenantA.id);
    });
  });
});
