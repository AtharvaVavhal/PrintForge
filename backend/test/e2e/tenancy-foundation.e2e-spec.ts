import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { resetDatabase } from './support/db';

/**
 * SaaS Master Plan Phase 1 — foundational tenancy models
 * (PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.2–B.8; acceptance
 * criteria AC-2, AC-3, AC-4, AC-8, AC-9, AC-11, AC-14).
 *
 * Pure schema-constraint tests — a bare PrismaClient against the isolated
 * printforge_test database, no Nest app needed (Phase 1 adds no HTTP surface;
 * spec AC-17). These prove the DB itself enforces the isolation invariants,
 * not just application convention (frozen SaaS invariant 3).
 */
describe('SaaS Foundation — Phase 1 tenancy models', () => {
  const prisma = new PrismaClient();

  async function makeUser(prefix = 'u'): Promise<string> {
    const u = await prisma.user.create({
      data: {
        email: `${prefix}-${randomUUID()}@example.test`,
        passwordHash: 'x',
      },
    });
    return u.id;
  }

  async function makeTenant(): Promise<string> {
    const t = await prisma.tenant.create({
      data: { slug: `t-${randomUUID()}` },
    });
    return t.id;
  }

  async function makeStore(
    tenantId: string,
    isPrimary = false,
    slug = `s-${randomUUID()}`,
  ): Promise<string> {
    const s = await prisma.store.create({
      data: { tenantId, slug, name: 'Test Store', isPrimary },
    });
    return s.id;
  }

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── AC-2 — Store belongs to exactly one Tenant (FK RESTRICT) ──────────────
  it('AC-2: a Store cannot be created without a valid tenantId', async () => {
    await expect(
      prisma.store.create({
        data: { tenantId: randomUUID(), slug: 's1', name: 'Orphan' },
      }),
    ).rejects.toMatchObject({ code: 'P2003' }); // FK constraint failed
  });

  it('AC-2: a Tenant with a Store cannot be hard-deleted (RESTRICT)', async () => {
    const tenantId = await makeTenant();
    await makeStore(tenantId);
    await expect(
      prisma.tenant.delete({ where: { id: tenantId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  // ── AC-3 — exactly one primary Store per Tenant ──────────────────────────
  it('AC-3: a second isPrimary Store for the same Tenant is rejected', async () => {
    const tenantId = await makeTenant();
    await makeStore(tenantId, true);
    await expect(makeStore(tenantId, true)).rejects.toMatchObject({
      code: 'P2002', // unique constraint (partial unique index)
    });
  });

  it('AC-3: two different Tenants may each have their own primary Store', async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    await expect(makeStore(a, true)).resolves.toBeDefined();
    await expect(makeStore(b, true)).resolves.toBeDefined();
  });

  it('AC-3: many non-primary Stores are allowed for one Tenant', async () => {
    const tenantId = await makeTenant();
    await makeStore(tenantId, false);
    await makeStore(tenantId, false);
    await expect(prisma.store.count({ where: { tenantId } })).resolves.toBe(2);
  });

  // ── Store (tenantId, slug) unique ───────────────────────────────────────
  it('Store slug is unique per Tenant, not globally', async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    await makeStore(a, false, 'shop');
    await expect(makeStore(b, false, 'shop')).resolves.toBeDefined(); // ok — different tenant
    await expect(makeStore(a, false, 'shop')).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  // ── AC-4 — TenantMembership one per (userId, tenantId) ───────────────────
  it('AC-4: a duplicate (userId, tenantId) membership is rejected', async () => {
    const userId = await makeUser();
    const tenantId = await makeTenant();
    await prisma.tenantMembership.create({
      data: { userId, tenantId, role: 'OWNER', status: 'ACTIVE' },
    });
    await expect(
      prisma.tenantMembership.create({
        data: { userId, tenantId, role: 'VIEWER' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('AC-4: the same User may be OWNER of one Tenant and VIEWER of another', async () => {
    const userId = await makeUser();
    const x = await makeTenant();
    const y = await makeTenant();
    await prisma.tenantMembership.create({
      data: { userId, tenantId: x, role: 'OWNER', status: 'ACTIVE' },
    });
    await expect(
      prisma.tenantMembership.create({
        data: { userId, tenantId: y, role: 'VIEWER', status: 'ACTIVE' },
      }),
    ).resolves.toBeDefined();
  });

  it('membership.userId FK is RESTRICT — a User with a membership is protected', async () => {
    const userId = await makeUser();
    const tenantId = await makeTenant();
    await prisma.tenantMembership.create({
      data: { userId, tenantId, role: 'ADMIN' },
    });
    await expect(
      prisma.user.delete({ where: { id: userId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  // ── AC-8 — StoreDomain.hostname is globally unique ───────────────────────
  it('AC-8: the same hostname cannot be used by two different Stores', async () => {
    const tA = await makeTenant();
    const tB = await makeTenant();
    const sA = await makeStore(tA);
    const sB = await makeStore(tB);
    const hostname = `shop-${randomUUID()}.example.test`;
    await prisma.storeDomain.create({
      data: { storeId: sA, tenantId: tA, hostname },
    });
    await expect(
      prisma.storeDomain.create({
        data: { storeId: sB, tenantId: tB, hostname },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('StoreDomain: exactly one primary domain per Store', async () => {
    const tenantId = await makeTenant();
    const storeId = await makeStore(tenantId);
    await prisma.storeDomain.create({
      data: {
        storeId,
        tenantId,
        hostname: `a-${randomUUID()}.example.test`,
        isPrimary: true,
      },
    });
    await expect(
      prisma.storeDomain.create({
        data: {
          storeId,
          tenantId,
          hostname: `b-${randomUUID()}.example.test`,
          isPrimary: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  // ── AC-9 — Subscription is 1:1 with Tenant ──────────────────────────────
  it('AC-9: a Tenant can have at most one Subscription', async () => {
    const tenantId = await makeTenant();
    const plan = await prisma.plan.create({
      data: { key: `free-${randomUUID()}`, name: 'Free' },
    });
    await prisma.subscription.create({
      data: { tenantId, planId: plan.id, status: 'ACTIVE' },
    });
    await expect(
      prisma.subscription.create({
        data: { tenantId, planId: plan.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('AC-9: SubscriptionStatus accepts exactly the 7 frozen states', async () => {
    const tenantId = await makeTenant();
    const plan = await prisma.plan.create({
      data: { key: `p-${randomUUID()}`, name: 'P' },
    });
    for (const status of [
      'PENDING',
      'TRIALING',
      'ACTIVE',
      'PAST_DUE',
      'PAUSED',
      'CANCELLED',
      'EXPIRED',
    ] as const) {
      const t = await prisma.tenant.create({
        data: { slug: `t-${randomUUID()}` },
      });
      await expect(
        prisma.subscription.create({
          data: { tenantId: t.id, planId: plan.id, status },
        }),
      ).resolves.toMatchObject({ status });
    }
    void tenantId;
  });

  // ── AC-11 / AC-14 — a full tenant bootstrap links correctly ──────────────
  it('AC-14: a full tenant (Tenant + primary Store + OWNER membership + Free/ACTIVE Subscription) can be created and is linked', async () => {
    const ownerId = await makeUser('owner');

    const plan = await prisma.plan.upsert({
      where: { key: 'free' },
      update: {},
      create: { key: 'free', name: 'Free', isPublic: true },
    });

    const tenant = await prisma.tenant.create({
      data: {
        slug: `tenant-1-${randomUUID()}`,
        status: 'ACTIVE',
        stores: {
          create: {
            slug: 'primary',
            name: 'Primary Store',
            status: 'ACTIVE',
            isPrimary: true,
          },
        },
        memberships: {
          create: { userId: ownerId, role: 'OWNER', status: 'ACTIVE' },
        },
        subscription: {
          create: {
            planId: plan.id,
            status: 'ACTIVE',
            currentPeriodStart: new Date(),
          },
        },
      },
      include: { stores: true, memberships: true, subscription: true },
    });

    expect(tenant.stores).toHaveLength(1);
    expect(tenant.stores[0].isPrimary).toBe(true);
    expect(tenant.memberships).toHaveLength(1);
    expect(tenant.memberships[0].role).toBe('OWNER');
    expect(tenant.memberships[0].status).toBe('ACTIVE');
    expect(tenant.subscription?.status).toBe('ACTIVE');
    expect(tenant.subscription?.planId).toBe(plan.id);

    // AC-11 — every new row resolves into exactly one tenant subtree
    const domain = await prisma.storeDomain.create({
      data: {
        storeId: tenant.stores[0].id,
        tenantId: tenant.id,
        hostname: `tenant-1-${randomUUID()}.printforge.test`,
        isPrimary: true,
        verificationStatus: 'PENDING',
      },
    });
    expect(domain.tenantId).toBe(tenant.id);
  });
});
