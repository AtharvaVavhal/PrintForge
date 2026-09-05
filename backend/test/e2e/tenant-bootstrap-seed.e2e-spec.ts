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

function runSeed(): string {
  return execFileSync(TS_NODE, ['prisma/seed-tenant-bootstrap.ts'], {
    cwd: BACKEND_ROOT,
    env: { ...process.env }, // carries DATABASE_URL=printforge_test, NODE_ENV=test
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('tenant-bootstrap seed — CI smoke (AC-14)', () => {
  const prisma = new PrismaClient();

  beforeEach(async () => {
    await resetDatabase(prisma);
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
