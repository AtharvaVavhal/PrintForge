import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { resetDatabase } from './support/db';
import { backfillUsageCounts } from '../../prisma/backfill/phase6-w8-usage-backfill';
import { PERSISTENT_PERIOD } from '../../src/usage/usage-period';

/**
 * Phase 6 W8 — real-Postgres proof of `backfillUsageCounts`. No Nest app
 * needed (same reasoning `phase6-w1-plan-backfill.spec.ts`'s own e2e
 * sibling would use, and `entitlement-engine.e2e-spec.ts` already
 * establishes) — a bare `PrismaClient` is enough to prove the real
 * counting queries and the real `Usage` upserts against real Postgres.
 */
describe('Phase 6 W8 — usage backfill (real Postgres)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma, { seedBaselineTenant: false });
  });

  async function makeTenant() {
    return prisma.tenant.create({
      data: { slug: `w8-backfill-${randomUUID()}` },
    });
  }

  async function makeCategory(tenantId: string) {
    return prisma.category.create({
      data: {
        tenantId,
        name: 'Cat',
        slug: `cat-${randomUUID()}`,
        isActive: true,
      },
    });
  }

  it('reconciles Usage.count to the real current Product/TenantMembership/UploadedFile counts for a tenant with pre-existing, never-incremented data', async () => {
    const tenant = await makeTenant();
    const category = await makeCategory(tenant.id);

    // Three real Product rows, created directly (bypassing
    // ProductsService/assertLimit entirely) — simulating data that
    // existed before Phase 6 W5's enforcement wiring, exactly the gap
    // this backfill exists to close.
    for (let i = 0; i < 3; i++) {
      await prisma.product.create({
        data: {
          tenantId: tenant.id,
          categoryId: category.id,
          name: `Product ${i}`,
          slug: `product-${i}-${randomUUID()}`,
          basePrice: '10.00',
          minQuantity: 1,
          isActive: true,
        },
      });
    }

    // Two ACTIVE/INVITED memberships + one SUSPENDED (must be excluded).
    const owner = await prisma.user.create({
      data: { email: `owner-${randomUUID()}@test.local`, passwordHash: 'x' },
    });
    const invitee = await prisma.user.create({
      data: { email: `invitee-${randomUUID()}@test.local`, passwordHash: 'x' },
    });
    const suspended = await prisma.user.create({
      data: {
        email: `suspended-${randomUUID()}@test.local`,
        passwordHash: 'x',
      },
    });
    await prisma.tenantMembership.create({
      data: {
        userId: owner.id,
        tenantId: tenant.id,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
    await prisma.tenantMembership.create({
      data: {
        userId: invitee.id,
        tenantId: tenant.id,
        role: 'STAFF',
        status: 'INVITED',
      },
    });
    await prisma.tenantMembership.create({
      data: {
        userId: suspended.id,
        tenantId: tenant.id,
        role: 'STAFF',
        status: 'SUSPENDED',
      },
    });

    // Two real UploadedFile rows: 1,048,576 bytes (1 MiB) and 100 bytes
    // (ceils to 1 MiB) -> 2 MiB total.
    await prisma.uploadedFile.create({
      data: {
        cloudinaryPublicId: `w8-backfill-${randomUUID()}`,
        uploadedByUserId: owner.id,
        format: 'png',
        bytes: 1_048_576,
        resourceType: 'image',
        deliveryType: 'upload',
        tenantId: tenant.id,
      },
    });
    await prisma.uploadedFile.create({
      data: {
        cloudinaryPublicId: `w8-backfill-${randomUUID()}`,
        uploadedByUserId: owner.id,
        format: 'png',
        bytes: 100,
        resourceType: 'image',
        deliveryType: 'upload',
        tenantId: tenant.id,
      },
    });

    // Confirm the pre-backfill gap: zero Usage rows exist at all, despite
    // all this real, pre-existing data.
    expect(await prisma.usage.count({ where: { tenantId: tenant.id } })).toBe(
      0,
    );

    const result = await backfillUsageCounts(prisma);

    expect(result.tenantsProcessed).toBe(1);

    const products = await prisma.usage.findUniqueOrThrow({
      where: {
        tenantId_limitKey_period: {
          tenantId: tenant.id,
          limitKey: 'products',
          period: PERSISTENT_PERIOD,
        },
      },
    });
    expect(products.count).toBe(3);

    const teamMembers = await prisma.usage.findUniqueOrThrow({
      where: {
        tenantId_limitKey_period: {
          tenantId: tenant.id,
          limitKey: 'team_members',
          period: PERSISTENT_PERIOD,
        },
      },
    });
    expect(teamMembers.count).toBe(2); // SUSPENDED excluded

    const storageMb = await prisma.usage.findUniqueOrThrow({
      where: {
        tenantId_limitKey_period: {
          tenantId: tenant.id,
          limitKey: 'storage_mb',
          period: PERSISTENT_PERIOD,
        },
      },
    });
    expect(storageMb.count).toBe(2);
  });

  it('is idempotent against real Postgres: running it twice leaves row counts and values unchanged', async () => {
    const tenant = await makeTenant();
    const category = await makeCategory(tenant.id);
    await prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: category.id,
        name: 'Solo product',
        slug: `solo-${randomUUID()}`,
        basePrice: '5.00',
        minQuantity: 1,
        isActive: true,
      },
    });

    await backfillUsageCounts(prisma);
    const firstRowCount = await prisma.usage.count({
      where: { tenantId: tenant.id },
    });
    const firstValue = await prisma.usage.findUniqueOrThrow({
      where: {
        tenantId_limitKey_period: {
          tenantId: tenant.id,
          limitKey: 'products',
          period: PERSISTENT_PERIOD,
        },
      },
    });

    await backfillUsageCounts(prisma);
    const secondRowCount = await prisma.usage.count({
      where: { tenantId: tenant.id },
    });
    const secondValue = await prisma.usage.findUniqueOrThrow({
      where: {
        tenantId_limitKey_period: {
          tenantId: tenant.id,
          limitKey: 'products',
          period: PERSISTENT_PERIOD,
        },
      },
    });

    expect(secondRowCount).toBe(firstRowCount);
    expect(secondValue.count).toBe(firstValue.count);
    expect(secondValue.count).toBe(1);
  });

  it('a tenant with zero products/members/uploads reconciles to zero, not a missing row', async () => {
    const tenant = await makeTenant();

    await backfillUsageCounts(prisma);

    const products = await prisma.usage.findUniqueOrThrow({
      where: {
        tenantId_limitKey_period: {
          tenantId: tenant.id,
          limitKey: 'products',
          period: PERSISTENT_PERIOD,
        },
      },
    });
    expect(products.count).toBe(0);
  });

  it('correctly converges a STALE Usage row (from data deleted/reduced since it was last written) back down to the real current count', async () => {
    const tenant = await makeTenant();
    // A stale row claiming 50 products, with zero real Product rows.
    await prisma.usage.create({
      data: {
        tenantId: tenant.id,
        limitKey: 'products',
        period: PERSISTENT_PERIOD,
        count: 50,
      },
    });

    await backfillUsageCounts(prisma);

    const products = await prisma.usage.findUniqueOrThrow({
      where: {
        tenantId_limitKey_period: {
          tenantId: tenant.id,
          limitKey: 'products',
          period: PERSISTENT_PERIOD,
        },
      },
    });
    expect(products.count).toBe(0);
  });
});
