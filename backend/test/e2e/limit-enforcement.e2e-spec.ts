import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  apiPath,
  authHeader,
  http,
  registerAdmin,
  registerUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { LimitEnforcementService } from '../../src/limits/limit-enforcement.service';

/**
 * Phase 6 W5 — limit enforcement proven at the REAL resource-creation
 * boundary: real HTTP requests through the full app (`POST /products`,
 * `POST /admin/team/invite`, `POST /admin/team/:id/suspend`), real
 * Postgres, real transactions. No guard/service is mocked. This is the
 * mandatory real-Postgres proof the W5 authorization requires beyond
 * `usage-engine.e2e-spec.ts`'s own (resource-agnostic) CAS proofs.
 */
describe('Phase 6 W5 — Limit Enforcement (real Postgres, real resource endpoints)', () => {
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

  async function makePlanWithLimit(
    limitKey: string,
    limitValue: number | null,
  ) {
    const plan = await prisma.plan.create({
      data: {
        key: `plan-${randomUUID().slice(0, 8)}`,
        name: 'Test Plan',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    await prisma.planLimit.create({
      data: { planId: plan.id, limitKey, limitValue, period: 'PERSISTENT' },
    });
    return plan;
  }

  async function attachSubscription(tenantId: string, planId: string) {
    await prisma.subscription.create({
      data: { tenantId, planId, status: 'ACTIVE' },
    });
  }

  async function makeCategory(tenantId: string) {
    return prisma.category.create({
      data: {
        tenantId,
        name: 'Test Category',
        slug: `cat-${randomUUID().slice(0, 8)}`,
      },
    });
  }

  function createProductPayload(categoryId: string, slug?: string) {
    return {
      categoryId,
      name: 'Test Product',
      slug: slug ?? `prod-${randomUUID()}`,
      basePrice: 10,
      minQuantity: 1,
    };
  }

  async function usageCount(tenantId: string, limitKey: string) {
    const row = await prisma.usage.findUnique({
      where: {
        tenantId_limitKey_period: { tenantId, limitKey, period: 'persistent' },
      },
    });
    return row?.count ?? 0;
  }

  // ─── 1/9: product limit enforcement (under / exhausted) ─────────────────

  it('1/9. product creation succeeds under the limit, then is denied (403 limit_exceeded) once exhausted — no product created on denial', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithLimit('products', 1);
    await attachSubscription(admin.tenantId, plan.id);
    const category = await makeCategory(admin.tenantId);

    await http(app)
      .post(apiPath('/products'))
      .set(...authHeader(admin))
      .send(createProductPayload(category.id))
      .expect(201);
    expect(await usageCount(admin.tenantId, 'products')).toBe(1);

    const res = await http(app)
      .post(apiPath('/products'))
      .set(...authHeader(admin))
      .send(createProductPayload(category.id))
      .expect(403);
    expect(res.body.error.message).toBe('limit_exceeded');

    const products = await prisma.product.findMany({
      where: { tenantId: admin.tenantId },
    });
    expect(products).toHaveLength(1); // the denied attempt created nothing
    expect(await usageCount(admin.tenantId, 'products')).toBe(1); // unchanged
  });

  it('a missing PlanLimit row (no product limit configured) denies product creation entirely (deny-by-default, P6-D2)', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await prisma.plan.create({
      data: {
        key: `plan-${randomUUID().slice(0, 8)}`,
        name: 'Bare Plan',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    await attachSubscription(admin.tenantId, plan.id);
    const category = await makeCategory(admin.tenantId);

    const res = await http(app)
      .post(apiPath('/products'))
      .set(...authHeader(admin))
      .send(createProductPayload(category.id))
      .expect(403);
    expect(res.body.error.message).toBe('limit_exceeded');
  });

  // ─── 6: unlimited resource creation + usage tracking ────────────────────

  it('6. an unlimited products limit (NULL) allows creation and STILL tracks usage', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithLimit('products', null);
    await attachSubscription(admin.tenantId, plan.id);
    const category = await makeCategory(admin.tenantId);

    await http(app)
      .post(apiPath('/products'))
      .set(...authHeader(admin))
      .send(createProductPayload(category.id))
      .expect(201);

    expect(await usageCount(admin.tenantId, 'products')).toBe(1);
  });

  // ─── 7: resource-create rollback (mandatory) ────────────────────────────
  //
  // Note: `Product.slug` uniqueness (`products_storeId_slug_key`, a
  // hand-added migration index, not modeled as `@@unique` in the current
  // `schema.prisma`) is scoped to `(storeId, slug)` — but `createProduct`
  // never sets `storeId` (confirmed by reading the service), so every
  // product it creates has `storeId: NULL`. Standard SQL unique-index
  // semantics exclude NULL from uniqueness enforcement, so two products
  // with the same slug and `storeId: NULL` do NOT collide — a duplicate
  // slug can never actually reach `mapUniqueConstraintError`'s catch block
  // via this real HTTP path today. This is a genuine, pre-existing,
  // incidental discovery (unrelated to W5, not introduced by it — flagged
  // in the W5 report §33, not silently fixed here as that would be
  // unrelated-code modification). Proving the rollback invariant therefore
  // uses the real, DI-resolved `LimitEnforcementService` directly inside a
  // real `prisma.$transaction` with a deliberately-thrown failure
  // afterward — still real Postgres, the real production service, no
  // mocks — rather than relying on a product-specific trigger this schema
  // does not actually support.

  it('7. a reservation that succeeds, followed by a same-transaction failure, rolls back BOTH — usage returns to its prior value', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithLimit('products', 10);
    await attachSubscription(admin.tenantId, plan.id);
    const limitEnforcementService = app.get(LimitEnforcementService);

    await expect(
      prisma.$transaction(async (tx) => {
        const result = await limitEnforcementService.assertLimit(
          tx,
          admin.tenantId,
          'products',
          1,
        );
        expect(result).toBeUndefined(); // reservation succeeded
        throw new Error('simulated downstream failure after reservation');
      }),
    ).rejects.toThrow('simulated downstream failure after reservation');

    expect(await usageCount(admin.tenantId, 'products')).toBe(0);
    const row = await prisma.usage.findUnique({
      where: {
        tenantId_limitKey_period: {
          tenantId: admin.tenantId,
          limitKey: 'products',
          period: 'persistent',
        },
      },
    });
    expect(row).toBeNull(); // even the "ensure row exists" step rolled back
  });

  // ─── 8: cross-tenant isolation ────────────────────────────────────────────

  it('8. two tenants with independent product limits never interfere with each other', async () => {
    const adminA = await registerAdmin(app, prisma);
    const adminB = await registerAdmin(app, prisma);
    const planA = await makePlanWithLimit('products', 1);
    const planB = await makePlanWithLimit('products', 5);
    await attachSubscription(adminA.tenantId, planA.id);
    await attachSubscription(adminB.tenantId, planB.id);
    const categoryA = await makeCategory(adminA.tenantId);
    const categoryB = await makeCategory(adminB.tenantId);

    await http(app)
      .post(apiPath('/products'))
      .set(...authHeader(adminA))
      .send(createProductPayload(categoryA.id))
      .expect(201);
    // A is now exhausted (limit 1) — must deny, regardless of B's own room.
    await http(app)
      .post(apiPath('/products'))
      .set(...authHeader(adminA))
      .send(createProductPayload(categoryA.id))
      .expect(403);

    // B has its own, completely independent limit — unaffected by A.
    await http(app)
      .post(apiPath('/products'))
      .set(...authHeader(adminB))
      .send(createProductPayload(categoryB.id))
      .expect(201);

    expect(await usageCount(adminA.tenantId, 'products')).toBe(1);
    expect(await usageCount(adminB.tenantId, 'products')).toBe(1);
  });

  // ─── 2/10: concurrent resource creation at the boundary (mandatory) ─────

  describe('concurrency at the real resource boundary (mandatory)', () => {
    it('2/10. limit=10, current=9: two concurrent product creations — exactly one succeeds, one denied, final count=10, no duplicate product', async () => {
      const admin = await registerAdmin(app, prisma);
      const plan = await makePlanWithLimit('products', 10);
      await attachSubscription(admin.tenantId, plan.id);
      const category = await makeCategory(admin.tenantId);
      await prisma.usage.create({
        data: {
          tenantId: admin.tenantId,
          limitKey: 'products',
          period: 'persistent',
          count: 9,
        },
      });

      const [r1, r2] = await Promise.all([
        http(app)
          .post(apiPath('/products'))
          .set(...authHeader(admin))
          .send(createProductPayload(category.id)),
        http(app)
          .post(apiPath('/products'))
          .set(...authHeader(admin))
          .send(createProductPayload(category.id)),
      ]);

      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 403]);
      expect(await usageCount(admin.tenantId, 'products')).toBe(10);
      const products = await prisma.product.findMany({
        where: { tenantId: admin.tenantId },
      });
      expect(products).toHaveLength(1); // exactly one real product created
    });

    it('limit=10, current=8: three concurrent product creations — exactly two succeed, one denied, final count=10', async () => {
      const admin = await registerAdmin(app, prisma);
      const plan = await makePlanWithLimit('products', 10);
      await attachSubscription(admin.tenantId, plan.id);
      const category = await makeCategory(admin.tenantId);
      await prisma.usage.create({
        data: {
          tenantId: admin.tenantId,
          limitKey: 'products',
          period: 'persistent',
          count: 8,
        },
      });

      const results = await Promise.all(
        Array.from({ length: 3 }, async () =>
          http(app)
            .post(apiPath('/products'))
            .set(...authHeader(admin))
            .send(createProductPayload(category.id)),
        ),
      );

      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 201, 403]);
      expect(await usageCount(admin.tenantId, 'products')).toBe(10);
      const products = await prisma.product.findMany({
        where: { tenantId: admin.tenantId },
      });
      expect(products).toHaveLength(2);
    });
  });

  // ─── 3/4: team-member limit enforcement + suspend decrement ─────────────

  describe('team-member limit enforcement', () => {
    it('3. inviting a team member succeeds under the limit, then is denied once exhausted', async () => {
      const admin = await registerAdmin(app, prisma);
      const plan = await makePlanWithLimit('team_members', 1);
      await attachSubscription(admin.tenantId, plan.id);
      const target1 = await registerUser(app, 'target1');
      const target2 = await registerUser(app, 'target2');

      await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(admin))
        .send({ email: target1.email, role: 'STAFF' })
        .expect(201);
      expect(await usageCount(admin.tenantId, 'team_members')).toBe(1);

      const res = await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(admin))
        .send({ email: target2.email, role: 'STAFF' })
        .expect(403);
      expect(res.body.error.message).toBe('limit_exceeded');

      const memberships = await prisma.tenantMembership.count({
        where: { tenantId: admin.tenantId },
      });
      expect(memberships).toBe(2); // the OWNER (admin) + target1 only
    });

    it('4. suspending a member decrements usage, freeing capacity for a new invite', async () => {
      const admin = await registerAdmin(app, prisma);
      const plan = await makePlanWithLimit('team_members', 1);
      await attachSubscription(admin.tenantId, plan.id);
      const target1 = await registerUser(app, 'target1');
      const target2 = await registerUser(app, 'target2');

      const invite1 = await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(admin))
        .send({ email: target1.email, role: 'STAFF' })
        .expect(201);
      // Exhausted — a second invite is denied.
      await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(admin))
        .send({ email: target2.email, role: 'STAFF' })
        .expect(403);

      await http(app)
        .post(apiPath(`/admin/team/${invite1.body.data.id}/suspend`))
        .set(...authHeader(admin))
        .expect(200);
      expect(await usageCount(admin.tenantId, 'team_members')).toBe(0);

      // Capacity freed — the second invite now succeeds.
      await http(app)
        .post(apiPath('/admin/team/invite'))
        .set(...authHeader(admin))
        .send({ email: target2.email, role: 'STAFF' })
        .expect(201);
      expect(await usageCount(admin.tenantId, 'team_members')).toBe(1);
    });

    // 5. unsuspend limit re-check — NOT TESTED: no unsuspend/reactivate
    // endpoint or service method exists anywhere in this codebase today
    // (grepped `team.service.ts`/`team.controller.ts` in full — only
    // invite/updateRole/suspend exist). Documented as deferred in the W5
    // report §7/§32 rather than inventing a new business capability to
    // test against.
  });
});
