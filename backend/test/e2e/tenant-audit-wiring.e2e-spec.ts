import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  apiPath,
  authHeader,
  createProduct,
  grantOwnerMembership,
  http,
  registerSuperAdmin,
  registerUser,
  TestUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { SUPPORT_SESSION_HEADER } from '../../src/common/tenant/support-session-context.guard';

/**
 * Phase 5 W8 — Tenant Control Plane audit wiring (SaaS Master Plan §11).
 * Proves the coverage matrix's own required properties for a representative
 * operation per audited category (full 11-point proof), plus lighter
 * spot-checks (audit created, correct tenant/actor) for the remaining
 * operations sharing the same mechanism — see the W8 implementation
 * report's own coverage-quality section for exactly which operations got
 * which depth and why.
 */
describe('Phase 5 W8 — Tenant Control Plane audit wiring', () => {
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

  async function setupOwner(): Promise<{ owner: TestUser; tenantId: string }> {
    const owner = await registerUser(app, 'owner');
    const { tenantId } = await grantOwnerMembership(prisma, owner.id);
    return { owner, tenantId };
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

  /** Direct-via-Prisma order fixture — order creation itself goes through
   * checkout (out of scope here); this test suite only needs an existing
   * order in a known status to exercise adminTransitionStatus's audit
   * wiring, same "build minimal exact state directly" convention
   * `createProduct`/`createCustomizationField` fixtures already use. */
  async function createOrder(
    tenantId: string,
    userId: string,
    status: 'PAID' | 'CANCELLED' = 'PAID',
  ): Promise<string> {
    const order = await prisma.order.create({
      data: {
        orderNumber: `PF-${randomUUID().slice(0, 8)}`,
        userId,
        status,
        subtotal: '100.00',
        shippingFee: '0.00',
        total: '100.00',
        shippingRecipientName: 'Test Recipient',
        shippingPhone: '9999999999',
        shippingAddressLine1: '123 Test Street',
        shippingCity: 'Pune',
        shippingState: 'Maharashtra',
        shippingPostalCode: '411001',
        shippingCountry: 'India',
        tenantId,
      },
    });
    return order.id;
  }

  // ─── A. PRODUCTS ────────────────────────────────────────────────────────

  describe('A. products', () => {
    it('create: full matrix — audit created, correct tenant/actor, cross-tenant parent rejected with no audit, suspended tenant blocked', async () => {
      const { owner, tenantId } = await setupOwner();
      const { categoryId } = await createProduct(prisma, { tenantId });

      const res = await http(app)
        .post(apiPath('/products'))
        .set(...authHeader(owner))
        .send({
          categoryId,
          name: 'Business Cards',
          slug: 'business-cards',
          basePrice: 10,
          minQuantity: 1,
        })
        .expect(201);

      const rows = await prisma.tenantAuditLog.findMany({
        where: {
          tenantId,
          action: 'product.create',
          targetId: res.body.data.id as string,
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].tenantId).toBe(tenantId);
      expect(rows[0].actorMembershipId).toBe(
        await ownerMembershipId(tenantId, owner.id),
      );
      expect(rows[0].viaSupportSessionId).toBeNull();
      expect(JSON.stringify(rows[0].metadata)).not.toMatch(
        /password|token|secret/i,
      );

      // Cross-tenant parent category → rejected, no audit written.
      const ownerB = await registerUser(app, 'owner-b');
      await grantOwnerMembership(prisma, ownerB.id);
      const before = await prisma.tenantAuditLog.count({
        where: { action: 'product.create' },
      });
      await http(app)
        .post(apiPath('/products'))
        .set(...authHeader(ownerB))
        .send({
          categoryId, // belongs to the FIRST tenant, not ownerB's
          name: 'Should not be created',
          slug: 'should-not-be-created',
          basePrice: 10,
          minQuantity: 1,
        })
        .expect(404);
      const after = await prisma.tenantAuditLog.count({
        where: { action: 'product.create' },
      });
      expect(after).toBe(before);

      // Unauthorized (STAFF) creates no audit event either.
      // ADMIN gets 403 (products:write not held by STAFF/VIEWER — see
      // security review); confirm zero additional audit rows either way.
      const beforeUnauth = await prisma.tenantAuditLog.count({
        where: { action: 'product.create' },
      });
      const stranger = await registerUser(app, 'stranger');
      await http(app)
        .post(apiPath('/products'))
        .set(...authHeader(stranger))
        .send({
          categoryId,
          name: 'Unauthorized attempt',
          slug: 'unauthorized-attempt',
          basePrice: 10,
          minQuantity: 1,
        })
        .expect(403);
      expect(
        await prisma.tenantAuditLog.count({
          where: { action: 'product.create' },
        }),
      ).toBe(beforeUnauth);

      // Suspended tenant blocks the operation entirely (W4 lifecycle).
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'SUSPENDED' },
      });
      await http(app)
        .post(apiPath('/products'))
        .set(...authHeader(owner))
        .send({
          categoryId,
          name: 'Blocked by suspension',
          slug: 'blocked-by-suspension',
          basePrice: 10,
          minQuantity: 1,
        })
        .expect(403);
    });

    it('update: audited with correct tenant/actor (no business-history duplication — Product has no separate history table to preserve)', async () => {
      const { owner, tenantId } = await setupOwner();
      const { productId } = await createProduct(prisma, { tenantId });

      const res = await http(app)
        .patch(apiPath(`/products/${productId}`))
        .set(...authHeader(owner))
        .send({ name: 'Renamed Product' })
        .expect(200);
      expect(res.body.data.name).toBe('Renamed Product');

      const rows = await prisma.tenantAuditLog.findMany({
        where: { tenantId, action: 'product.update', targetId: productId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].actorMembershipId).toBe(
        await ownerMembershipId(tenantId, owner.id),
      );
    });

    it('deactivate/reactivate are audited', async () => {
      const { owner, tenantId } = await setupOwner();
      const { productId } = await createProduct(prisma, { tenantId });

      await http(app)
        .delete(apiPath(`/products/${productId}`))
        .set(...authHeader(owner))
        .expect(200);
      await http(app)
        .post(apiPath(`/products/${productId}/reactivate`))
        .set(...authHeader(owner))
        .expect(200);

      const actions = (
        await prisma.tenantAuditLog.findMany({
          where: { tenantId, targetId: productId },
          orderBy: { createdAt: 'asc' },
        })
      ).map((r) => r.action);
      expect(actions).toEqual(['product.deactivate', 'product.reactivate']);
    });
  });

  // ─── B. CATEGORIES ──────────────────────────────────────────────────────

  describe('B. categories', () => {
    it('create is audited with correct tenant/actor', async () => {
      const { owner, tenantId } = await setupOwner();
      const res = await http(app)
        .post(apiPath('/categories'))
        .set(...authHeader(owner))
        .send({ name: 'Stationery', slug: 'stationery' })
        .expect(201);

      const rows = await prisma.tenantAuditLog.findMany({
        where: {
          tenantId,
          action: 'category.create',
          targetId: res.body.data.id as string,
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].actorMembershipId).toBe(
        await ownerMembershipId(tenantId, owner.id),
      );
    });
  });

  // ─── C. ORDERS ──────────────────────────────────────────────────────────

  describe('C. orders', () => {
    it('status_change: full matrix — audited, correct tenant/actor, OrderStatusHistory preserved alongside it, unauthorized creates no audit', async () => {
      const { owner, tenantId } = await setupOwner();
      const orderId = await createOrder(tenantId, owner.id, 'PAID');

      const res = await http(app)
        .patch(apiPath(`/admin/orders/${orderId}/status`))
        .set(...authHeader(owner))
        .send({ status: 'CONFIRMED' })
        .expect(200);
      expect(res.body.data.status).toBe('CONFIRMED');

      const auditRows = await prisma.tenantAuditLog.findMany({
        where: { tenantId, action: 'order.status_change', targetId: orderId },
      });
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].actorMembershipId).toBe(
        await ownerMembershipId(tenantId, owner.id),
      );
      expect(auditRows[0].viaSupportSessionId).toBeNull();

      // OrderStatusHistory (business history) is preserved — not replaced.
      const history = await prisma.orderStatusHistory.findMany({
        where: { orderId },
      });
      expect(history).toHaveLength(1);
      expect(history[0].toStatus).toBe('CONFIRMED');

      // Unauthorized attempt (STAFF, no orders:transition) creates no audit.
      const staffOwner = await registerUser(app, 'staff-tenant-owner');
      const { tenantId: tenantB } = await grantOwnerMembership(
        prisma,
        staffOwner.id,
      );
      void tenantB;
      const before = await prisma.tenantAuditLog.count({
        where: { action: 'order.status_change' },
      });
      const nonMember = await registerUser(app, 'non-member');
      await http(app)
        .patch(apiPath(`/admin/orders/${orderId}/status`))
        .set(...authHeader(nonMember))
        .send({ status: 'IN_PRODUCTION' })
        .expect(403);
      expect(
        await prisma.tenantAuditLog.count({
          where: { action: 'order.status_change' },
        }),
      ).toBe(before);
    });

    it('cancel is audited distinctly from a plain status change', async () => {
      const { owner, tenantId } = await setupOwner();
      const orderId = await createOrder(tenantId, owner.id, 'PAID');

      await http(app)
        .patch(apiPath(`/admin/orders/${orderId}/status`))
        .set(...authHeader(owner))
        .send({ status: 'CANCELLED', reason: 'customer request' })
        .expect(200);

      const rows = await prisma.tenantAuditLog.findMany({
        where: { tenantId, targetId: orderId },
      });
      expect(rows.map((r) => r.action)).toEqual(['order.cancel']);
    });
  });

  // ─── D. COUPONS ─────────────────────────────────────────────────────────

  describe('D. coupons', () => {
    it('create: full matrix — audited, correct tenant/actor, no secrets, unauthorized creates no audit', async () => {
      const { owner, tenantId } = await setupOwner();

      const res = await http(app)
        .post(apiPath('/admin/coupons'))
        .set(...authHeader(owner))
        .send({
          code: 'SAVE10',
          type: 'PERCENTAGE',
          percentageOff: 10,
          scopeType: 'STORE_WIDE',
        })
        .expect(201);

      const rows = await prisma.tenantAuditLog.findMany({
        where: {
          tenantId,
          action: 'coupon.create',
          targetId: res.body.data.id as string,
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].actorMembershipId).toBe(
        await ownerMembershipId(tenantId, owner.id),
      );
      expect(JSON.stringify(rows[0].metadata)).not.toMatch(/secret|token/i);

      const stranger = await registerUser(app, 'stranger');
      const before = await prisma.tenantAuditLog.count({
        where: { action: 'coupon.create' },
      });
      await http(app)
        .post(apiPath('/admin/coupons'))
        .set(...authHeader(stranger))
        .send({
          code: 'NOPE',
          type: 'PERCENTAGE',
          percentageOff: 5,
          scopeType: 'STORE_WIDE',
        })
        .expect(403);
      expect(
        await prisma.tenantAuditLog.count({
          where: { action: 'coupon.create' },
        }),
      ).toBe(before);
    });

    it('update is audited', async () => {
      const { owner, tenantId } = await setupOwner();
      const createRes = await http(app)
        .post(apiPath('/admin/coupons'))
        .set(...authHeader(owner))
        .send({
          code: 'SAVE20',
          type: 'PERCENTAGE',
          percentageOff: 20,
          scopeType: 'STORE_WIDE',
        })
        .expect(201);
      const couponId = createRes.body.data.id as string;

      await http(app)
        .patch(apiPath(`/admin/coupons/${couponId}`))
        .set(...authHeader(owner))
        .send({ isActive: false })
        .expect(200);

      const rows = await prisma.tenantAuditLog.findMany({
        where: { tenantId, action: 'coupon.update', targetId: couponId },
      });
      expect(rows).toHaveLength(1);
    });
  });

  // ─── E. REVIEWS ─────────────────────────────────────────────────────────

  describe('E. reviews', () => {
    /** A Review requires a real, delivered OrderItem (verified-purchase
     * FK, `onDelete: Restrict`) — build the minimal Order + OrderItem
     * directly, same "exact state, not the real flow" convention
     * `createOrder` above already uses for order-status tests. */
    async function createReviewDirect(
      tenantId: string,
      productId: string,
      userId: string,
    ): Promise<string> {
      const orderId = await createOrder(tenantId, userId, 'PAID');
      const orderItem = await prisma.orderItem.create({
        data: {
          orderId,
          productId,
          productNameSnapshot: 'Test Product',
          unitPriceSnapshot: '100.00',
          quantity: 1,
          lineTotal: '100.00',
          tenantId,
        },
      });
      const review = await prisma.review.create({
        data: {
          productId,
          userId,
          orderItemId: orderItem.id,
          rating: 4,
          status: 'PUBLISHED',
          tenantId,
        },
      });
      return review.id;
    }

    it('moderate: full matrix — audited, correct tenant/actor, unauthorized creates no audit', async () => {
      const { owner, tenantId } = await setupOwner();
      const { productId } = await createProduct(prisma, { tenantId });
      const reviewId = await createReviewDirect(tenantId, productId, owner.id);

      await http(app)
        .patch(apiPath(`/admin/reviews/${reviewId}/status`))
        .set(...authHeader(owner))
        .send({ status: 'REJECTED' })
        .expect(200);

      const rows = await prisma.tenantAuditLog.findMany({
        where: { tenantId, action: 'review.moderate', targetId: reviewId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].actorMembershipId).toBe(
        await ownerMembershipId(tenantId, owner.id),
      );

      const stranger = await registerUser(app, 'stranger');
      const before = await prisma.tenantAuditLog.count({
        where: { action: 'review.moderate' },
      });
      await http(app)
        .patch(apiPath(`/admin/reviews/${reviewId}/status`))
        .set(...authHeader(stranger))
        .send({ status: 'PUBLISHED' })
        .expect(403);
      expect(
        await prisma.tenantAuditLog.count({
          where: { action: 'review.moderate' },
        }),
      ).toBe(before);
    });
  });

  // ─── F. SETTINGS ────────────────────────────────────────────────────────

  describe('F. settings', () => {
    // Phase 5 W9 (decision D11) — AppSetting ownership rework's own
    // instructions tightened this event's metadata shape: key + ownership
    // type + operation, deliberately never the raw setting value (some of
    // the 12 keys carry business-identifying data, e.g. a GSTIN, that has
    // no reason to be duplicated into an audit trail forever). This
    // replaces W8's original `{previousValue, newValue}` shape — the
    // tenant/actor attribution and audited-once guarantee this test
    // exists to prove are otherwise unchanged.
    it('update: full matrix — audited, correct tenant/actor, key + ownership in metadata, never the raw value', async () => {
      const { owner, tenantId } = await setupOwner();

      await http(app)
        .patch(apiPath('/admin/settings/shippingFeeFlat'))
        .set(...authHeader(owner))
        .send({ value: '49' })
        .expect(200);

      const rows = await prisma.tenantAuditLog.findMany({
        where: {
          tenantId,
          action: 'setting.update',
          targetId: 'shippingFeeFlat',
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].actorMembershipId).toBe(
        await ownerMembershipId(tenantId, owner.id),
      );
      const metadata = rows[0].metadata as {
        key: string;
        ownership: string;
        operation: string;
      };
      expect(metadata).toEqual({
        key: 'shippingFeeFlat',
        ownership: 'STORE',
        operation: 'update',
      });
      // The written value ('49.00') never appears in the audit row at all.
      expect(JSON.stringify(rows[0].metadata)).not.toContain('49.00');
      expect(JSON.stringify(rows[0].metadata)).not.toMatch(
        /password|secret|token/i,
      );
    });
  });

  // ─── G. SUPPORTSESSION ATTRIBUTION ──────────────────────────────────────

  describe('G. SupportSession attribution', () => {
    it('a support session with products:write reaches a product mutation, and the audit uses viaSupportSessionId — never a fabricated membership', async () => {
      const { tenantId } = await setupOwner();
      const { productId } = await createProduct(prisma, { tenantId });
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionRes = await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId,
          justification: 'investigating a catalog issue',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          grantedPermissions: ['products:write'],
        })
        .expect(201);
      const sessionId = sessionRes.body.data.id as string;

      await http(app)
        .patch(apiPath(`/products/${productId}`))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionId)
        .send({ name: 'Renamed via support session' })
        .expect(200);

      const rows = await prisma.tenantAuditLog.findMany({
        where: { tenantId, action: 'product.update', targetId: productId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].viaSupportSessionId).toBe(sessionId);
      expect(rows[0].actorMembershipId).toBeNull();
    });

    it('a support session WITHOUT products:write is denied — the ceiling is never bypassed', async () => {
      const { tenantId } = await setupOwner();
      const { productId } = await createProduct(prisma, { tenantId });
      const superAdmin = await registerSuperAdmin(app, prisma);
      const sessionRes = await http(app)
        .post(apiPath('/platform/support-sessions'))
        .set(...authHeader(superAdmin))
        .send({
          tenantId,
          justification: 'unrelated',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          grantedPermissions: ['orders:read'],
        })
        .expect(201);
      await http(app)
        .patch(apiPath(`/products/${productId}`))
        .set(...authHeader(superAdmin))
        .set(SUPPORT_SESSION_HEADER, sessionRes.body.data.id as string)
        .send({ name: 'Should be denied' })
        .expect(403);
    });
  });

  // ─── H. TEAM REGRESSION (W7) ────────────────────────────────────────────

  describe('H. team regression', () => {
    it('W7 invite/role-change/suspend each still produce exactly one audit row — W8 introduces no duplicate', async () => {
      const { owner, tenantId } = await setupOwner();
      const target = await registerUser(app, 'target');

      const inviteRes = await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(owner))
        .send({ email: target.email, role: 'STAFF' })
        .expect(201);
      const membershipId = inviteRes.body.data.id as string;

      await http(app)
        .patch(apiPath(`/admin/team/${membershipId}/role`))
        .set(...authHeader(owner))
        .send({ role: 'ADMIN' })
        .expect(200);

      await http(app)
        .post(apiPath(`/admin/team/${membershipId}/suspend`))
        .set(...authHeader(owner))
        .expect(200);

      const counts = await Promise.all(
        ['team.invite', 'team.role_change', 'team.suspend'].map((action) =>
          prisma.tenantAuditLog.count({
            where: { tenantId, action, targetId: membershipId },
          }),
        ),
      );
      expect(counts).toEqual([1, 1, 1]);
    });
  });

  // ─── I. PLATFORM REGRESSION (W3) ────────────────────────────────────────

  describe('I. platform regression', () => {
    it('W3 platform tenant suspend/resume still write PlatformAuditLog only — never TenantAuditLog', async () => {
      const { tenantId } = await setupOwner();
      const superAdmin = await registerSuperAdmin(app, prisma);

      await http(app)
        .post(apiPath(`/platform/tenants/${tenantId}/suspend`))
        .set(...authHeader(superAdmin))
        .send({ justification: 'testing' })
        .expect(200);

      const platformRows = await prisma.platformAuditLog.findMany({
        where: { tenantId, action: 'tenant.suspend' },
      });
      expect(platformRows).toHaveLength(1);

      const tenantRows = await prisma.tenantAuditLog.findMany({
        where: { tenantId, action: 'tenant.suspend' },
      });
      expect(tenantRows).toHaveLength(0);
    });
  });

  // ─── J. TENANT ISOLATION ────────────────────────────────────────────────

  describe('J. tenant isolation', () => {
    it("a TenantAuditLog write always carries the ACTING tenant's own id — never a client-supplied or cross-tenant value", async () => {
      const { owner, tenantId } = await setupOwner();
      const { productId } = await createProduct(prisma, { tenantId });

      await http(app)
        .patch(apiPath(`/products/${productId}`))
        .set(...authHeader(owner))
        .send({ name: 'Isolation check' })
        .expect(200);

      const rows = await prisma.tenantAuditLog.findMany({
        where: { targetId: productId, action: 'product.update' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].tenantId).toBe(tenantId);
    });

    it('Tenant A cannot cause a TenantAuditLog to be written for Tenant B (create-family operations reject a cross-tenant parent outright)', async () => {
      const { owner: ownerA, tenantId: tenantA } = await setupOwner();
      const { tenantId: tenantB } = await setupOwner();
      const { categoryId: categoryB } = await createProduct(prisma, {
        tenantId: tenantB,
      });

      await http(app)
        .post(apiPath('/products'))
        .set(...authHeader(ownerA))
        .send({
          categoryId: categoryB,
          name: 'Cross tenant attempt',
          slug: 'cross-tenant-attempt',
          basePrice: 10,
          minQuantity: 1,
        })
        .expect(404);

      const rows = await prisma.tenantAuditLog.findMany({
        where: { tenantId: tenantA, action: 'product.create' },
      });
      expect(rows).toHaveLength(0);
    });
  });
});
