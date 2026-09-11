import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  apiPath,
  authHeader,
  createProduct,
  grantMembership,
  grantOwnerMembership,
  http,
  registerSuperAdmin,
  registerUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { ACTIVE_TENANT_HEADER } from '../../src/common/tenant/tenant-context.guard';

/**
 * Phase 5 W4 — tenant lifecycle enforcement (SaaS Master Plan §11).
 * Proves the SINGLE, centralized invariant (`assertTenantActive`, wired
 * into `TenantLifecycleGuard` for the merchant/admin path and
 * `StorefrontTenantResolver`/`CheckoutService` for the storefront path)
 * rather than re-testing every individual controller — representative
 * routes from different controllers (`admin.controller.ts`,
 * `products.controller.ts`) prove the guard-level mechanism is
 * path-independent.
 */
describe('Phase 5 W4 — tenant lifecycle enforcement', () => {
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

  async function suspendTenant(tenantId: string): Promise<void> {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'SUSPENDED' },
    });
  }

  // ─── A. ACTIVE TENANT (regression) ─────────────────────────────────────

  describe('A. active tenant', () => {
    it('existing admin behavior still works for an ACTIVE tenant', async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(owner))
        .expect(200);
      void tenantId;
    });

    it('existing storefront behavior (cart) still works for an ACTIVE tenant', async () => {
      const shopper = await registerUser(app, 'shopper');
      await prisma.tenant.create({ data: { slug: `active-${randomUUID()}` } });
      await http(app)
        .get(apiPath('/cart'))
        .set(...authHeader(shopper))
        .expect(200);
    });
  });

  // ─── B. SUSPENDED TENANT — ADMIN ────────────────────────────────────────

  describe('B. suspended tenant — admin access', () => {
    it('OWNER is blocked', async () => {
      const owner = await registerUser(app, 'owner');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      await suspendTenant(tenantId);
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(owner))
        .expect(403);
    });

    it('ADMIN is blocked', async () => {
      const owner = await registerUser(app, 'owner2');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      const admin = await registerUser(app, 'admin');
      await grantMembership(prisma, admin.id, tenantId, 'ADMIN');
      await suspendTenant(tenantId);
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(admin))
        .expect(403);
    });

    it('STAFF is blocked', async () => {
      const owner = await registerUser(app, 'owner3');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      const staff = await registerUser(app, 'staff');
      await grantMembership(prisma, staff.id, tenantId, 'STAFF');
      await suspendTenant(tenantId);
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(staff))
        .expect(403);
    });

    it('VIEWER is blocked', async () => {
      const owner = await registerUser(app, 'owner4');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      const viewer = await registerUser(app, 'viewer');
      await grantMembership(prisma, viewer.id, tenantId, 'VIEWER');
      await suspendTenant(tenantId);
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(viewer))
        .expect(403);
    });

    it('the block happens BEFORE the business operation — a blocked settings write does not change the value', async () => {
      const owner = await registerUser(app, 'owner5');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      // Set a known value while still ACTIVE.
      await http(app)
        .patch(apiPath('/admin/settings/storeName'))
        .set(...authHeader(owner))
        .send({ value: 'Before Suspension' })
        .expect(200);

      await suspendTenant(tenantId);

      await http(app)
        .patch(apiPath('/admin/settings/storeName'))
        .set(...authHeader(owner))
        .send({ value: 'Attempted During Suspension' })
        .expect(403);

      // Phase 5 W9 (decision D11) — storeName is STORE-owned, read from
      // storeSettings (never the old global app_settings table).
      const row = await prisma.storeSetting.findFirst({
        where: { tenantId, key: 'storeName' },
      });
      expect(row?.value).toBe('Before Suspension');
    });
  });

  // ─── C. SUSPENDED TENANT — COMMERCE (representative) ───────────────────

  describe('C. suspended tenant — commerce management (representative routes)', () => {
    it('product/catalog management (products.controller.ts — a DIFFERENT controller than admin.controller.ts) is blocked', async () => {
      const owner = await registerUser(app, 'owner6');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      await suspendTenant(tenantId);
      await http(app)
        .get(apiPath('/products/admin'))
        .set(...authHeader(owner))
        .expect(403);
    });

    it('order management is blocked', async () => {
      const owner = await registerUser(app, 'owner7');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      await suspendTenant(tenantId);
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(owner))
        .expect(403);
    });

    it('customer management is blocked', async () => {
      const owner = await registerUser(app, 'owner8');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      await suspendTenant(tenantId);
      await http(app)
        .get(apiPath('/admin/customers'))
        .set(...authHeader(owner))
        .expect(403);
    });

    it('coupon management is blocked', async () => {
      const owner = await registerUser(app, 'owner9');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      await suspendTenant(tenantId);
      await http(app)
        .get(apiPath('/admin/coupons'))
        .set(...authHeader(owner))
        .expect(403);
    });
  });

  // ─── D. SUSPENDED TENANT — STOREFRONT ───────────────────────────────────

  describe('D. suspended tenant — storefront', () => {
    it('cart access is blocked for a suspended tenant (StorefrontTenantResolver enforcement)', async () => {
      const shopper = await registerUser(app, 'shopper2');
      const tenant = await prisma.tenant.create({
        data: { slug: `susp-${randomUUID()}` },
      });
      await suspendTenant(tenant.id);
      await http(app)
        .get(apiPath('/cart'))
        .set(...authHeader(shopper))
        .expect(403);
    });

    it('checkout preview is blocked for a suspended tenant', async () => {
      const shopper = await registerUser(app, 'shopper3');
      const tenant = await prisma.tenant.create({
        data: { slug: `susp2-${randomUUID()}` },
      });
      const { productId } = await createProduct(prisma, {
        tenantId: tenant.id,
      });
      // Cart must be non-empty to reach the lifecycle check inside
      // previewCheckout, not the earlier "cart is empty" guard — add the
      // item via the real API while still ACTIVE, then suspend.
      await http(app)
        .post(apiPath('/cart/items'))
        .set(...authHeader(shopper))
        .send({ productId, quantity: 1 })
        .expect(201);

      await suspendTenant(tenant.id);
      await http(app)
        .post(apiPath('/checkout/validate'))
        .set(...authHeader(shopper))
        .send({})
        .expect(403);
    });

    it("a suspended tenant's storefront does not affect a different, ACTIVE tenant's storefront", async () => {
      const now = Date.now();
      const suspendedTenant = await prisma.tenant.create({
        data: {
          slug: `susp3-${randomUUID()}`,
          createdAt: new Date(now - 60_000),
        },
      });
      await suspendTenant(suspendedTenant.id);
      // A fresh shopper with no host/domain context resolves to the most
      // recently created tenant (StorefrontTenantResolver's own documented
      // fallback) — explicit, well-separated `createdAt` values (rather
      // than relying on real-clock ordering between two creates a
      // millisecond apart) make this deterministic: the newer, ACTIVE
      // tenant is unambiguously "most recent".
      await prisma.tenant.create({
        data: {
          slug: `active2-${randomUUID()}`,
          createdAt: new Date(now),
        },
      });
      const shopper = await registerUser(app, 'shopper4');
      await http(app)
        .get(apiPath('/cart'))
        .set(...authHeader(shopper))
        .expect(200);
    });
  });

  // ─── E. PLATFORM ────────────────────────────────────────────────────────

  describe('E. platform control plane remains unaffected', () => {
    it('SUPER_ADMIN can still GET a suspended tenant', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const owner = await registerUser(app, 'owner10');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      await suspendTenant(tenantId);

      const res = await http(app)
        .get(apiPath(`/platform/tenants/${tenantId}`))
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(res.body.data.status).toBe('SUSPENDED');
    });

    it('SUPER_ADMIN can still list tenants including suspended ones', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const owner = await registerUser(app, 'owner11');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      await suspendTenant(tenantId);

      const res = await http(app)
        .get(apiPath('/platform/tenants'))
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(
        (res.body.data as Array<{ id: string }>).some((t) => t.id === tenantId),
      ).toBe(true);
    });

    it('SUPER_ADMIN can still resume a suspended tenant, and access is restored', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const owner = await registerUser(app, 'owner12');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      await suspendTenant(tenantId);

      await http(app)
        .post(apiPath(`/platform/tenants/${tenantId}/resume`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'lifecycle test' })
        .expect(200);

      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(owner))
        .expect(200);
    });
  });

  // ─── F. TENANT ISOLATION ────────────────────────────────────────────────

  describe('F. tenant isolation', () => {
    it("suspending tenant A does not block tenant B's OWNER", async () => {
      const ownerA = await registerUser(app, 'ownerA');
      const { tenantId: tenantAId } = await grantOwnerMembership(
        prisma,
        ownerA.id,
      );
      const ownerB = await registerUser(app, 'ownerB');
      await grantOwnerMembership(prisma, ownerB.id);

      await suspendTenant(tenantAId);

      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(ownerA))
        .expect(403);
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(ownerB))
        .expect(200);
    });

    it('X-Active-Tenant is server-validated — a user in both a suspended and an active tenant is blocked only for the suspended one, per the header they actually select', async () => {
      const user = await registerUser(app, 'multi-member');
      const { tenantId: suspendedTenantId } = await grantOwnerMembership(
        prisma,
        user.id,
      );
      const { tenantId: activeTenantId } = await (async () => {
        const t = await prisma.tenant.create({
          data: { slug: `active3-${randomUUID()}` },
        });
        await grantMembership(prisma, user.id, t.id, 'OWNER');
        return { tenantId: t.id };
      })();
      await suspendTenant(suspendedTenantId);

      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(user))
        .set(ACTIVE_TENANT_HEADER, suspendedTenantId)
        .expect(403);
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(user))
        .set(ACTIVE_TENANT_HEADER, activeTenantId)
        .expect(200);
    });

    it('a client-supplied tenantId cannot bypass suspension for the resolved tenant', async () => {
      const owner = await registerUser(app, 'owner13');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);
      const otherTenant = await prisma.tenant.create({
        data: { slug: `other-${randomUUID()}` },
      });
      await suspendTenant(tenantId);

      // The lifecycle guard runs before the body's ValidationPipe even
      // sees the request (Nest's guard -> pipe -> handler order), so a
      // client-supplied `tenantId` in the body can't "arrive first" and
      // doesn't change the outcome either way — the request is blocked
      // (403) regardless of what the body contains. There is no route in
      // this codebase that accepts a body/query tenantId as authorization
      // in the first place; this proves attempting one doesn't somehow
      // open a bypass path.
      await http(app)
        .patch(apiPath('/admin/settings/storeName'))
        .set(...authHeader(owner))
        .send({ value: 'x', tenantId: otherTenant.id })
        .expect(403);
    });
  });

  // ─── G. TRANSITION REGRESSION ───────────────────────────────────────────

  describe('G. transition regression (via the existing W3 endpoints)', () => {
    it('ACTIVE -> SUSPENDED (via POST /platform/tenants/:id/suspend) then blocks; SUSPENDED -> ACTIVE (via resume) then restores', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const owner = await registerUser(app, 'owner14');
      const { tenantId } = await grantOwnerMembership(prisma, owner.id);

      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(owner))
        .expect(200);

      await http(app)
        .post(apiPath(`/platform/tenants/${tenantId}/suspend`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'transition regression test' })
        .expect(200);

      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(owner))
        .expect(403);

      await http(app)
        .post(apiPath(`/platform/tenants/${tenantId}/resume`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'transition regression test' })
        .expect(200);

      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(owner))
        .expect(200);
    });
  });
});
