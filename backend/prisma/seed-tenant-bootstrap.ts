import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

/**
 * SaaS Master Plan Phase 1 — dev/test tenant bootstrap (spec §B.8 item 6,
 * acceptance criterion AC-14).
 *
 * Creates, idempotently:
 *   - a `Free` Plan row (the minimum required for Subscription creation — the
 *     full plan catalogue + features/limits are Phase 6, NOT here)
 *   - Tenant #1 (decision D3-A: the existing deployment becomes an ordinary
 *     tenant with no implicit privileges — identified by slug in Phase 1;
 *     the real display name is a Phase 4 input)
 *   - its single primary Store
 *   - an OWNER TenantMembership for a chosen User
 *   - a Free / ACTIVE Subscription
 *
 * DEV / TEST ONLY. Refuses to run when NODE_ENV=production. Performs no
 * production data migration and touches no existing commerce table.
 *
 * Usage:
 *   npx ts-node prisma/seed-tenant-bootstrap.ts
 *
 * Optional env:
 *   SEED_TENANT_SLUG    (default: "tenant-1")
 *   SEED_STORE_SLUG     (default: "primary")
 *   SEED_STORE_NAME     (default: "PrintForge" — matches AppSetting.storeName default)
 *   SEED_OWNER_EMAIL    (default: the first role=ADMIN user, else a created
 *                        dev user "owner@tenant-1.local")
 */

const prisma = new PrismaClient();

function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to run: NODE_ENV=production. This Phase 1 bootstrap seed is dev/test only. ' +
        'The production Tenant #1 bootstrap is a Phase 4 step (gated on decision D2 + the restore drill).',
    );
  }
}

async function resolveOwnerId(): Promise<string> {
  const explicitEmail = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  if (explicitEmail) {
    const u = await prisma.user.findUnique({ where: { email: explicitEmail } });
    if (!u) {
      throw new Error(
        `SEED_OWNER_EMAIL="${explicitEmail}" does not match any existing user.`,
      );
    }
    return u.id;
  }

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
  });
  if (admin) {
    return admin.id;
  }

  const devEmail = 'owner@tenant-1.local';
  const created = await prisma.user.upsert({
    where: { email: devEmail },
    update: {},
    // A non-usable password hash — this dev user is a membership holder only,
    // not a login. Real merchant auth for Tenant #1's owner is wired in Phase 2.
    create: { email: devEmail, passwordHash: `disabled-${randomUUID()}` },
  });
  return created.id;
}

async function main(): Promise<void> {
  assertNotProduction();

  const tenantSlug = process.env.SEED_TENANT_SLUG?.trim() || 'tenant-1';
  const storeSlug = process.env.SEED_STORE_SLUG?.trim() || 'primary';
  const storeName = process.env.SEED_STORE_NAME?.trim() || 'PrintForge';

  const plan = await prisma.plan.upsert({
    where: { key: 'free' },
    update: {},
    create: { key: 'free', name: 'Free', isPublic: true },
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {},
    create: { slug: tenantSlug, status: 'ACTIVE' },
  });

  const store = await prisma.store.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: storeSlug } },
    update: {},
    create: {
      tenantId: tenant.id,
      slug: storeSlug,
      name: storeName,
      status: 'ACTIVE',
      isPrimary: true,
    },
  });

  const ownerId = await resolveOwnerId();
  const membership = await prisma.tenantMembership.upsert({
    where: { userId_tenantId: { userId: ownerId, tenantId: tenant.id } },
    update: {},
    create: {
      userId: ownerId,
      tenantId: tenant.id,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });

  const subscription = await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
    },
  });

  console.log('Phase 1 tenant bootstrap complete:');
  console.log(`  plan         ${plan.key} (${plan.id})`);
  console.log(`  tenant       ${tenant.slug} (${tenant.id}) status=${tenant.status}`);
  console.log(`  store        ${store.slug} "${store.name}" (${store.id}) isPrimary=${store.isPrimary}`);
  console.log(`  membership   OWNER user=${ownerId} status=${membership.status} (${membership.id})`);
  console.log(`  subscription ${subscription.status} plan=${plan.key} (${subscription.id})`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
