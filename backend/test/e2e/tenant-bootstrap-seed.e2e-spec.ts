import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { resetDatabase } from './support/db';

/**
 * CI seed-smoke for `backend/prisma/seed-tenant-bootstrap.ts` (audit finding
 * P2-3; SaaS Master Plan Phase 1 acceptance criterion AC-14).
 *
 * Runs the real seed script as a subprocess against the isolated
 * `printforge_test` database and verifies it produces the five linked
 * foundation rows and is idempotent. Touches no production data — the seed's
 * own `assertNotProduction()` guard plus `resetDatabase`'s `*_test`-only guard
 * both apply, and `DATABASE_URL` is inherited from the e2e env
 * (`test/e2e/support/env.setup.ts` → `.env.test`).
 */
const BACKEND_ROOT = resolve(__dirname, '..', '..');
const TS_NODE = resolve(BACKEND_ROOT, 'node_modules', '.bin', 'ts-node');

function runSeed(extraEnv: Record<string, string> = {}): string {
  return execFileSync(TS_NODE, ['prisma/seed-tenant-bootstrap.ts'], {
    cwd: BACKEND_ROOT,
    // carries DATABASE_URL=printforge_test, NODE_ENV=test
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('tenant-bootstrap seed — CI smoke (AC-14)', () => {
  const prisma = new PrismaClient();

  beforeEach(async () => {
    // This suite asserts an exact row count/set produced by the seed
    // script itself, starting from a genuinely empty tenants table — the
    // default baseline-tenant seed (Phase 4 W7 / P4-D2) would make that
    // assertion false unconditionally, so it's opted out here.
    await resetDatabase(prisma, { seedBaselineTenant: false });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('bootstraps exactly the five linked foundation rows', async () => {
    const out = runSeed();
    expect(out).toContain('Phase 1 tenant bootstrap complete');

    const [plans, tenants, stores, memberships, subs] = await Promise.all([
      prisma.plan.findMany(),
      prisma.tenant.findMany({
        include: { stores: true, memberships: true, subscription: true },
      }),
      prisma.store.findMany(),
      prisma.tenantMembership.findMany(),
      prisma.subscription.findMany(),
    ]);

    expect(plans).toHaveLength(1);
    expect(plans[0].key).toBe('free');

    expect(tenants).toHaveLength(1);
    const tenant = tenants[0];
    expect(tenant.slug).toBe('tenant-1');
    expect(tenant.status).toBe('ACTIVE');

    expect(stores).toHaveLength(1);
    expect(stores[0].tenantId).toBe(tenant.id);
    expect(stores[0].isPrimary).toBe(true);
    expect(stores[0].status).toBe('ACTIVE');

    expect(memberships).toHaveLength(1);
    expect(memberships[0].tenantId).toBe(tenant.id);
    expect(memberships[0].role).toBe('OWNER');
    expect(memberships[0].status).toBe('ACTIVE');

    expect(subs).toHaveLength(1);
    expect(subs[0].tenantId).toBe(tenant.id);
    expect(subs[0].planId).toBe(plans[0].id);
    expect(subs[0].status).toBe('ACTIVE');

    // the membership owner is a real user row
    const owner = await prisma.user.findUnique({
      where: { id: memberships[0].userId },
    });
    expect(owner).not.toBeNull();
  }, 60_000);

  it('is idempotent — a second run leaves exactly one of each row', async () => {
    runSeed();
    runSeed();

    const [plans, tenants, stores, memberships, subs] = await Promise.all([
      prisma.plan.count(),
      prisma.tenant.count(),
      prisma.store.count(),
      prisma.tenantMembership.count(),
      prisma.subscription.count(),
    ]);
    expect({ plans, tenants, stores, memberships, subs }).toEqual({
      plans: 1,
      tenants: 1,
      stores: 1,
      memberships: 1,
      subs: 1,
    });
  }, 60_000);

  // ─── Phase 9 W6 — PLATFORM_SUBDOMAIN provisioning (spec §5, S-5) ───────

  describe('Phase 9 W6 — platform subdomain (spec §5 creation point (b))', () => {
    const PLATFORM_DOMAIN = 'stores.printforge.test';
    const EXPECTED_HOST = `primary.${PLATFORM_DOMAIN}`;

    it('creates the store AND its always-on PLATFORM_SUBDOMAIN row in one run', async () => {
      const out = runSeed({ PLATFORM_STOREFRONT_DOMAIN: PLATFORM_DOMAIN });
      expect(out).toContain(`subdomain    created ${EXPECTED_HOST}`);

      const rows = await prisma.storeDomain.findMany();
      expect(rows).toHaveLength(1);
      const store = await prisma.store.findFirstOrThrow();
      expect(rows[0]).toMatchObject({
        storeId: store.id,
        tenantId: store.tenantId,
        hostname: EXPECTED_HOST,
        type: 'PLATFORM_SUBDOMAIN',
        // The platform owns that DNS zone — nothing for a merchant to prove.
        verificationStatus: 'VERIFIED',
        verificationMethod: null,
        verificationToken: null,
        // Never consulted for this type — the wildcard covers it (§7.2).
        tlsStatus: null,
        isPrimary: true,
      });
    }, 60_000);

    it('is idempotent — a second run reports `existing` and adds no row', async () => {
      runSeed({ PLATFORM_STOREFRONT_DOMAIN: PLATFORM_DOMAIN });
      const out = runSeed({ PLATFORM_STOREFRONT_DOMAIN: PLATFORM_DOMAIN });
      expect(out).toContain(`subdomain    existing ${EXPECTED_HOST}`);
      expect(await prisma.storeDomain.count()).toBe(1);
    }, 60_000);

    it('skips with a stated reason when PLATFORM_STOREFRONT_DOMAIN is unset (§5.2 — no default)', async () => {
      const out = runSeed({ PLATFORM_STOREFRONT_DOMAIN: '' });
      expect(out).toContain('subdomain    SKIPPED');
      expect(await prisma.storeDomain.count()).toBe(0);
    }, 60_000);

    it('S-5: a derived hostname already held by ANOTHER store fails the seed loudly, and creates no store', async () => {
      // A pre-existing, unrelated store squatting the hostname this seed would
      // derive — the collision `Store.slug` not being globally unique allows.
      const other = await prisma.tenant.create({ data: { slug: 'other' } });
      const otherStore = await prisma.store.create({
        data: {
          tenantId: other.id,
          slug: 'primary',
          name: 'Other',
          status: 'ACTIVE',
          isPrimary: true,
        },
      });
      await prisma.storeDomain.create({
        data: {
          storeId: otherStore.id,
          tenantId: other.id,
          hostname: EXPECTED_HOST,
          type: 'PLATFORM_SUBDOMAIN',
          verificationStatus: 'VERIFIED',
          isPrimary: true,
        },
      });

      let failed = false;
      let output = '';
      try {
        runSeed({ PLATFORM_STOREFRONT_DOMAIN: PLATFORM_DOMAIN });
      } catch (err: unknown) {
        failed = true;
        const e = err as { stdout?: string; stderr?: string; message?: string };
        output = `${String(e.stdout ?? '')}${String(e.stderr ?? '')}${String(e.message ?? '')}`;
      }

      expect(failed).toBe(true);
      expect(output).toContain('PlatformSubdomainCollisionError');
      expect(output).toContain(EXPECTED_HOST);

      // The store/domain transaction rolled back: no second store was created,
      // and no suffixed hostname was invented (S-5's whole point).
      expect(await prisma.store.count()).toBe(1);
      expect(await prisma.storeDomain.count()).toBe(1);
      expect((await prisma.storeDomain.findFirstOrThrow()).storeId).toBe(
        otherStore.id,
      );
    }, 60_000);
  });

  it('refuses to run under NODE_ENV=production (safety guard)', () => {
    let failed = false;
    let stderr = '';
    try {
      execFileSync(TS_NODE, ['prisma/seed-tenant-bootstrap.ts'], {
        cwd: BACKEND_ROOT,
        env: { ...process.env, NODE_ENV: 'production' },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err: unknown) {
      failed = true;
      const e = err as { stderr?: string; message?: string };
      stderr = String(e.stderr ?? '') + String(e.message ?? '');
    }
    expect(failed).toBe(true);
    expect(stderr).toMatch(/NODE_ENV=production/);
  });
});
