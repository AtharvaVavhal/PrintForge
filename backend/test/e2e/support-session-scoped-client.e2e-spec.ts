import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import { registerSuperAdmin, registerUser } from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { getSupportSessionScopedClient } from '../../src/common/tenant/support-session-scoped-client';

/**
 * Phase 5 W5 — SupportSession scoped-client extension (SaaS Master Plan
 * §11; decisions P5-D4 / P5-D8).
 *
 * Real-Postgres coverage for the one thing a unit test cannot prove: that
 * `getSupportSessionScopedClient` actually produces row-level tenant
 * isolation (mirrors `tenant-isolation.e2e-spec.ts`'s existing D4 coverage
 * for `getTenantScopedClient` itself), and that the extension propagates
 * correctly into an interactive `$transaction` — the specific open question
 * W5's fact-find was required to answer empirically rather than assume.
 *
 * No SupportSession record, controller, service, or endpoint is created or
 * exercised anywhere in this file — `identity` objects below are
 * constructed directly in-test, standing in for what a future W6
 * SupportSession-resolution step would produce.
 */
describe('Phase 5 W5 — SupportSession scoped-client (D4 extension)', () => {
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

  async function makeTwoTenants() {
    const tenantA = await prisma.tenant.create({
      data: { slug: `support-a-${Date.now()}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { slug: `support-b-${Date.now()}` },
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
    const customerA = await prisma.customer.create({
      data: {
        storeId: storeA.id,
        tenantId: tenantA.id,
        email: 'a-customer@example.test',
        passwordHash: 'x',
      },
    });
    const customerB = await prisma.customer.create({
      data: {
        storeId: storeB.id,
        tenantId: tenantB.id,
        email: 'b-customer@example.test',
        passwordHash: 'x',
      },
    });
    return { tenantA, tenantB, storeA, storeB, customerA, customerB };
  }

  it('is constructible from a server-derived identity and is restricted to the intended tenant', async () => {
    const { tenantA, customerA } = await makeTwoTenants();

    const scopedToA = getSupportSessionScopedClient(prisma, {
      tenantId: tenantA.id,
      source: 'support-session',
    });

    const customers = await scopedToA.customer.findMany({});
    expect(customers).toHaveLength(1);
    expect(customers[0].id).toBe(customerA.id);
  });

  it("tenant A cannot access tenant B's rows through it — neither a list query nor a direct point lookup by id", async () => {
    const { tenantA, customerB } = await makeTwoTenants();

    const scopedToA = getSupportSessionScopedClient(prisma, {
      tenantId: tenantA.id,
      source: 'support-session',
    });

    const list = await scopedToA.customer.findMany({});
    expect(list.map((c) => c.id)).not.toContain(customerB.id);

    const direct = await scopedToA.customer.findUnique({
      where: { id: customerB.id },
    });
    expect(direct).toBeNull();
  });

  it('remains scoped to its own tenant even when the same PrismaService instance is also used, unscoped, by a SUPER_ADMIN caller elsewhere — no connection-level "admin mode" leaks into a later scoped-client construction', async () => {
    const { tenantA, customerA, customerB } = await makeTwoTenants();
    const admin = await registerSuperAdmin(app, prisma);

    // An entirely separate, unscoped read on a non-tenancy model (User),
    // performed by/for the SUPER_ADMIN, using the exact same PrismaService
    // instance the scoped client below will also use.
    const loadedAdmin = await prisma.user.findUnique({
      where: { id: admin.id },
    });
    expect(loadedAdmin?.platformRole).toBe('SUPER_ADMIN');

    const scopedToA = getSupportSessionScopedClient(prisma, {
      tenantId: tenantA.id,
      source: 'support-session',
    });
    const customers = await scopedToA.customer.findMany({});
    expect(customers.map((c) => c.id)).toEqual([customerA.id]);
    expect(customers.map((c) => c.id)).not.toContain(customerB.id);
  });

  it('sequential use does not leak between tenants — a later client for tenant B does not affect an earlier, still-referenced client for tenant A', async () => {
    const { tenantA, tenantB, customerA, customerB } = await makeTwoTenants();

    const scopedToA = getSupportSessionScopedClient(prisma, {
      tenantId: tenantA.id,
      source: 'support-session',
    });
    const firstReadA = await scopedToA.customer.findMany({});
    expect(firstReadA.map((c) => c.id)).toEqual([customerA.id]);

    const scopedToB = getSupportSessionScopedClient(prisma, {
      tenantId: tenantB.id,
      source: 'support-session',
    });
    const readB = await scopedToB.customer.findMany({});
    expect(readB.map((c) => c.id)).toEqual([customerB.id]);

    // scopedToA, constructed before scopedToB even existed, must still be
    // scoped to A — proves getSupportSessionScopedClient carries no shared
    // mutable state between calls.
    const secondReadA = await scopedToA.customer.findMany({});
    expect(secondReadA.map((c) => c.id)).toEqual([customerA.id]);
  });

  it('remains tenant-scoped inside an interactive $transaction run on the scoped client', async () => {
    const { tenantA, customerA, customerB } = await makeTwoTenants();

    const scopedToA = getSupportSessionScopedClient(prisma, {
      tenantId: tenantA.id,
      source: 'support-session',
    });

    const result = await scopedToA.$transaction(async (tx) => {
      return tx.customer.findMany({});
    });

    expect(result.map((c) => c.id)).toEqual([customerA.id]);
    expect(result.map((c) => c.id)).not.toContain(customerB.id);
  });

  it('a write issued inside that transaction is still stamped with the scoped tenant id, not a caller-supplied one', async () => {
    const { tenantA, storeA } = await makeTwoTenants();

    const scopedToA = getSupportSessionScopedClient(prisma, {
      tenantId: tenantA.id,
      source: 'support-session',
    });

    const created = await scopedToA.$transaction(async (tx) => {
      return tx.customer.create({
        data: {
          storeId: storeA.id,
          email: 'via-support-tx@example.test',
          passwordHash: 'x',
        } as never,
      });
    });

    expect(created.tenantId).toBe(tenantA.id);
  });

  it('fails closed for an empty tenantId even against the real app/DB wiring — never falls back to an unscoped or "most recent tenant" client', async () => {
    await makeTwoTenants();
    expect(() =>
      getSupportSessionScopedClient(prisma, {
        tenantId: '',
        source: 'support-session',
      }),
    ).toThrow();
  });

  it("does not affect or require a real membership — registerUser's own (non-admin, non-member) account plays no role and the scoped client is unaffected by its existence", async () => {
    const { tenantA, customerA } = await makeTwoTenants();
    await registerUser(app, 'bystander');

    const scopedToA = getSupportSessionScopedClient(prisma, {
      tenantId: tenantA.id,
      source: 'support-session',
    });
    const customers = await scopedToA.customer.findMany({});
    expect(customers.map((c) => c.id)).toEqual([customerA.id]);
  });
});
