import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { seedFreePlanCatalogue } from './free-plan-catalogue';
import { ensurePlatformSubdomain } from '../src/store-domains/platform-subdomain';

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
 *   - its single primary Store, WITH its PLATFORM_SUBDOMAIN StoreDomain row
 *     ({store-slug}.$PLATFORM_STOREFRONT_DOMAIN) in the same transaction
 *     (Phase 9 W6, spec §5 creation point (b))
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
 *   PLATFORM_STOREFRONT_DOMAIN
 *                       (no default — when unset, the PLATFORM_SUBDOMAIN row
 *                        is skipped and the reason is printed; §5.2)
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
    // P6-D1 — isActive/sortOrder/isEnterpriseCustom are nullable at the DB
    // level (G-19 forces this on the pre-existing `plans` table) with no
    // DB-level default, so a create() that omits them would silently
    // insert NULL rather than their intended default. Explicit here for
    // the same reason PlatformPlansService.createPlan() is explicit.
    create: {
      key: 'free',
      name: 'Free',
      isPublic: true,
      isActive: true,
      sortOrder: 0,
      isEnterpriseCustom: false,
    },
  });

  // Phase 6 W5 — business-approved Free-plan PlanFeature/PlanLimit
  // catalogue (docs/saas/DECISIONS.md). Idempotent upsert, safe on every
  // run, converges the catalogue to the approved values regardless of
  // whether `plan` above was just created or already existed.
  const catalogue = await seedFreePlanCatalogue(prisma, plan.id);

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {},
    create: { slug: tenantSlug, status: 'ACTIVE' },
  });

  // Phase 9 W6 (spec §5): the Store and its PLATFORM_SUBDOMAIN row are
  // created together, in ONE transaction — a store that exists without its
  // always-on platform hostname is a store the host_resolution pipeline
  // cannot serve at all. Both steps are idempotent, so re-running the seed
  // converges instead of failing.
  const { store, subdomain } = await prisma.$transaction(async (tx) => {
    const created = await tx.store.upsert({
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
    const result = await ensurePlatformSubdomain(tx, {
      storeId: created.id,
      tenantId: tenant.id,
      storeSlug: created.slug,
      platformStorefrontDomain:
        process.env.PLATFORM_STOREFRONT_DOMAIN?.trim() || null,
    });
    return { store: created, subdomain: result };
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
  console.log(
    `  plan         ${plan.key} (${plan.id}) catalogue: ${catalogue.featuresWritten} feature(s), ${catalogue.limitsWritten} limit(s)`,
  );
  console.log(
    `  tenant       ${tenant.slug} (${tenant.id}) status=${tenant.status}`,
  );
  console.log(
    `  store        ${store.slug} "${store.name}" (${store.id}) isPrimary=${store.isPrimary}`,
  );
  console.log(
    subdomain.outcome === 'skipped'
      ? `  subdomain    SKIPPED — PLATFORM_STOREFRONT_DOMAIN is not set, so no PLATFORM_SUBDOMAIN row exists for this store; host_resolution cannot serve it until one does`
      : `  subdomain    ${subdomain.outcome} ${subdomain.hostname} (${subdomain.storeDomainId})`,
  );
  console.log(
    `  membership   OWNER user=${ownerId} status=${membership.status} (${membership.id})`,
  );
  console.log(
    `  subscription ${subscription.status} plan=${plan.key} (${subscription.id})`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
