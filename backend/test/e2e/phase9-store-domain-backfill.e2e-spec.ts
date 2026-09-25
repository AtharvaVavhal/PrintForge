import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  backfillDomainTypes,
  backfillPlatformSubdomains,
  backfillResolutionModeRow,
  backfillTenant1CustomDomain,
  derivePlatformHostname,
  isUnderPlatformDomain,
  reconcile,
  reconciliationVerdicts,
  requirePlatformStorefrontDomain,
  runAllSteps,
  TENANT_1_CUSTOM_HOSTNAME,
  type Client,
} from '../../prisma/backfill/phase9-w2-store-domain-backfill';
import { STOREFRONT_RESOLUTION_MODE_KEY } from '../../src/platform/platform-config/storefront-resolution-mode.constants';
import { resetDatabase } from './support/db';

/**
 * Phase 9 §16.2 backfill (B-1…B-4) against the isolated `printforge_test`
 * database, mirroring `phase4-w4-backfill.e2e-spec.ts`'s convention: exercise
 * the real exported step functions against real Postgres constraints, not a
 * mock — the partial unique index `store_domains_store_primary_unique` is
 * exactly the thing these steps have to respect.
 *
 * Production is never touched: `resetDatabase` refuses any database whose name
 * does not end in `_test`, and nothing here reads a production connection.
 */
const PLATFORM_DOMAIN = 'stores.printforge.test';

describe('Phase 9 §16.2 — store-domain backfill', () => {
  const prisma = new PrismaClient();

  beforeEach(async () => {
    // Exact counts are asserted, so the default baseline tenant is opted out.
    await resetDatabase(prisma, { seedBaselineTenant: false });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const client = () => prisma as unknown as Client;

  async function makeTenantStore(
    slug: string,
  ): Promise<{ tenantId: string; storeId: string }> {
    const tenant = await prisma.tenant.create({
      data: { slug: `${slug}-${randomUUID().slice(0, 8)}` },
    });
    const store = await prisma.store.create({
      data: {
        tenantId: tenant.id,
        slug,
        name: slug,
        status: 'ACTIVE',
        isPrimary: true,
      },
    });
    return { tenantId: tenant.id, storeId: store.id };
  }

  // ─── pure helpers ──────────────────────────────────────────────────────

  describe('helpers', () => {
    it('classifies hostnames under the platform domain, apex included', () => {
      expect(
        isUnderPlatformDomain(`a.${PLATFORM_DOMAIN}`, PLATFORM_DOMAIN),
      ).toBe(true);
      expect(isUnderPlatformDomain(PLATFORM_DOMAIN, PLATFORM_DOMAIN)).toBe(
        true,
      );
      expect(
        isUnderPlatformDomain(
          `A.${PLATFORM_DOMAIN.toUpperCase()}.`,
          PLATFORM_DOMAIN,
        ),
      ).toBe(true);
      expect(isUnderPlatformDomain('shop.example', PLATFORM_DOMAIN)).toBe(
        false,
      );
      // Not a suffix match on a different registrable domain.
      expect(
        isUnderPlatformDomain('evilstores.printforge.test', PLATFORM_DOMAIN),
      ).toBe(false);
    });

    it('derives {slug}.{platformDomain}', () => {
      expect(derivePlatformHostname('Acme', PLATFORM_DOMAIN)).toBe(
        `acme.${PLATFORM_DOMAIN}`,
      );
    });

    it('refuses to run without PLATFORM_STOREFRONT_DOMAIN rather than guessing (§5.2)', () => {
      expect(() => requirePlatformStorefrontDomain(undefined)).toThrow(
        /PLATFORM_STOREFRONT_DOMAIN is not set/,
      );
      expect(() => requirePlatformStorefrontDomain('   ')).toThrow();
      expect(requirePlatformStorefrontDomain('Stores.Example.COM.')).toBe(
        'stores.example.com',
      );
    });
  });

  // ─── B-1 ───────────────────────────────────────────────────────────────

  describe('B-1 classify type', () => {
    it('sets CUSTOM, or PLATFORM_SUBDOMAIN when under the platform domain', async () => {
      const { tenantId, storeId } = await makeTenantStore('acme');
      await prisma.storeDomain.createMany({
        data: [
          {
            storeId,
            tenantId,
            hostname: 'shop.example',
            type: null,
            verificationStatus: 'VERIFIED',
          },
          {
            storeId,
            tenantId,
            hostname: `acme.${PLATFORM_DOMAIN}`,
            type: null,
            verificationStatus: 'VERIFIED',
          },
        ],
      });

      const res = await backfillDomainTypes(client(), PLATFORM_DOMAIN);
      expect(res.affected).toBe(2);

      const rows = await prisma.storeDomain.findMany({
        orderBy: { hostname: 'asc' },
      });
      expect(rows.map((r) => [r.hostname, r.type])).toEqual([
        [`acme.${PLATFORM_DOMAIN}`, 'PLATFORM_SUBDOMAIN'],
        ['shop.example', 'CUSTOM'],
      ]);
    });

    it('never overwrites an existing type, and a rerun is a no-op', async () => {
      const { tenantId, storeId } = await makeTenantStore('acme');
      // A deliberately "wrong" pre-set type must NOT be corrected.
      await prisma.storeDomain.create({
        data: {
          storeId,
          tenantId,
          hostname: `acme.${PLATFORM_DOMAIN}`,
          type: 'CUSTOM',
          verificationStatus: 'VERIFIED',
        },
      });

      const first = await backfillDomainTypes(client(), PLATFORM_DOMAIN);
      expect(first.affected).toBe(0);
      expect((await prisma.storeDomain.findFirstOrThrow()).type).toBe('CUSTOM');

      const second = await backfillDomainTypes(client(), PLATFORM_DOMAIN);
      expect(second.affected).toBe(0);
    });

    it('is a proven no-op on an empty table (the production expectation)', async () => {
      const res = await backfillDomainTypes(client(), PLATFORM_DOMAIN);
      expect(res.affected).toBe(0);
      expect(res.anomalies).toEqual([]);
    });
  });

  // ─── B-2 ───────────────────────────────────────────────────────────────

  describe('B-2 platform subdomains', () => {
    it('inserts one always-on row per store, primary when the store has none', async () => {
      const a = await makeTenantStore('alpha');
      const b = await makeTenantStore('beta');

      const res = await backfillPlatformSubdomains(client(), PLATFORM_DOMAIN);
      expect(res.affected).toBe(2);
      expect(res.anomalies).toEqual([]);

      const rows = await prisma.storeDomain.findMany({
        orderBy: { hostname: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        hostname: `alpha.${PLATFORM_DOMAIN}`,
        type: 'PLATFORM_SUBDOMAIN',
        verificationStatus: 'VERIFIED',
        verificationMethod: null,
        verificationToken: null,
        // Never consulted for this type — the wildcard covers it (§7.2).
        tlsStatus: null,
        isPrimary: true,
      });
      expect(rows.map((r) => r.storeId).sort()).toEqual(
        [a.storeId, b.storeId].sort(),
      );
    });

    it('does NOT claim primary when the store already has one', async () => {
      const { tenantId, storeId } = await makeTenantStore('acme');
      await prisma.storeDomain.create({
        data: {
          storeId,
          tenantId,
          hostname: 'already-primary.example',
          type: 'CUSTOM',
          verificationStatus: 'VERIFIED',
          tlsStatus: 'ISSUED',
          isPrimary: true,
        },
      });

      await backfillPlatformSubdomains(client(), PLATFORM_DOMAIN);
      const platform = await prisma.storeDomain.findUniqueOrThrow({
        where: { hostname: `acme.${PLATFORM_DOMAIN}` },
      });
      expect(platform.isPrimary).toBe(false);
      expect(
        await prisma.storeDomain.count({ where: { storeId, isPrimary: true } }),
      ).toBe(1);
    });

    it('is idempotent — a rerun inserts nothing', async () => {
      await makeTenantStore('acme');
      expect(
        (await backfillPlatformSubdomains(client(), PLATFORM_DOMAIN)).affected,
      ).toBe(1);
      expect(
        (await backfillPlatformSubdomains(client(), PLATFORM_DOMAIN)).affected,
      ).toBe(0);
      expect(await prisma.storeDomain.count()).toBe(1);
    });

    it('REPORTS a slug collision instead of inventing a suffixed hostname (S-5)', async () => {
      // Two tenants, same store slug -> same derived hostname.
      const first = await makeTenantStore('duplicate');
      const second = await prisma.tenant.create({
        data: { slug: `second-${randomUUID().slice(0, 8)}` },
      });
      const secondStore = await prisma.store.create({
        data: {
          tenantId: second.id,
          slug: 'duplicate',
          name: 'second',
          status: 'ACTIVE',
          isPrimary: true,
        },
      });

      const res = await backfillPlatformSubdomains(client(), PLATFORM_DOMAIN);
      expect(res.affected).toBe(1);
      expect(res.anomalies).toHaveLength(1);
      expect(res.anomalies[0]).toContain('B-2 collision');
      expect(res.anomalies[0]).toContain(secondStore.id);

      // Nothing suffixed, nothing overwritten: exactly one row exists and it
      // belongs to the store that got there first.
      const rows = await prisma.storeDomain.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].storeId).toBe(first.storeId);
    });
  });

  // ─── B-3 ───────────────────────────────────────────────────────────────

  describe('B-3 Tenant #1 custom domain', () => {
    /**
     * ⚖️ P9-D10 fixed this hostname and ⚖️ P9-D11 confirmed what it is NOT.
     * Pinned as a literal so neither can be undone silently: every other
     * assertion in this block reads the constant, so a changed constant would
     * otherwise still pass.
     */
    it('⚖️ P9-D10: the Tenant #1 CUSTOM canary is www.printforge.world', () => {
      expect(TENANT_1_CUSTOM_HOSTNAME).toBe('www.printforge.world');
      // ⚖️ P9-D11: never the Vercel deployment origin, and never a platform
      // subdomain — B-3 must stay a genuine CUSTOM host so it keeps exercising
      // the §4.3 VERIFIED + ISSUED serving gate.
      expect(TENANT_1_CUSTOM_HOSTNAME).not.toContain('vercel.app');
      expect(TENANT_1_CUSTOM_HOSTNAME.endsWith(`.${PLATFORM_DOMAIN}`)).toBe(
        false,
      );
    });

    it('registers www.printforge.world as VERIFIED + ISSUED + primary and demotes the platform row', async () => {
      const { tenantId, storeId } = await makeTenantStore('primary');
      await backfillPlatformSubdomains(client(), PLATFORM_DOMAIN);

      const res = await backfillTenant1CustomDomain(client(), tenantId);
      expect(res.affected).toBe(1);
      expect(res.anomalies).toEqual([]);

      const custom = await prisma.storeDomain.findUniqueOrThrow({
        where: { hostname: TENANT_1_CUSTOM_HOSTNAME },
      });
      expect(custom).toMatchObject({
        storeId,
        tenantId,
        type: 'CUSTOM',
        verificationStatus: 'VERIFIED',
        // Recorded as a platform action, not a DNS-challenge outcome, so no
        // method and no token (§16.2). ⚖️ P9-D10: the operator must have
        // independently verified DNS + provider attachment + HTTPS for this
        // hostname BEFORE the production pass — the backfill records that
        // state, it cannot establish or detect it.
        verificationMethod: null,
        verificationToken: null,
        tlsStatus: 'ISSUED',
        isPrimary: true,
      });
      const platform = await prisma.storeDomain.findUniqueOrThrow({
        where: { hostname: `primary.${PLATFORM_DOMAIN}` },
      });
      expect(platform.isPrimary).toBe(false);
      expect(
        await prisma.storeDomain.count({ where: { storeId, isPrimary: true } }),
      ).toBe(1);
    });

    it('is idempotent', async () => {
      const { tenantId } = await makeTenantStore('primary');
      await backfillPlatformSubdomains(client(), PLATFORM_DOMAIN);
      expect(
        (await backfillTenant1CustomDomain(client(), tenantId)).affected,
      ).toBe(1);
      expect(
        (await backfillTenant1CustomDomain(client(), tenantId)).affected,
      ).toBe(0);
      expect(
        await prisma.storeDomain.count({
          where: { hostname: TENANT_1_CUSTOM_HOSTNAME },
        }),
      ).toBe(1);
    });

    it('REPORTS, and does not steal, a hostname held by another store', async () => {
      const mine = await makeTenantStore('mine');
      const other = await makeTenantStore('other');
      await prisma.storeDomain.create({
        data: {
          storeId: other.storeId,
          tenantId: other.tenantId,
          hostname: TENANT_1_CUSTOM_HOSTNAME,
          type: 'CUSTOM',
          verificationStatus: 'VERIFIED',
          isPrimary: false,
        },
      });

      const res = await backfillTenant1CustomDomain(client(), mine.tenantId);
      expect(res.affected).toBe(0);
      expect(res.anomalies[0]).toContain('already held by store');
      expect(
        (
          await prisma.storeDomain.findUniqueOrThrow({
            where: { hostname: TENANT_1_CUSTOM_HOSTNAME },
          })
        ).storeId,
      ).toBe(other.storeId);
    });

    it('REPORTS a tenant with no primary store instead of picking one', async () => {
      const tenant = await prisma.tenant.create({
        data: { slug: `no-store-${randomUUID().slice(0, 8)}` },
      });
      const res = await backfillTenant1CustomDomain(client(), tenant.id);
      expect(res.affected).toBe(0);
      expect(res.anomalies[0]).toContain('has no primary Store');
      expect(await prisma.storeDomain.count()).toBe(0);
    });
  });

  // ─── B-4 ───────────────────────────────────────────────────────────────

  describe('B-4 resolution-mode row', () => {
    it('inserts the explicit legacy row so W8 flips an UPDATE with a from value', async () => {
      const res = await backfillResolutionModeRow(client());
      expect(res.affected).toBe(1);
      const row = await prisma.platformConfig.findUniqueOrThrow({
        where: { key: STOREFRONT_RESOLUTION_MODE_KEY },
      });
      expect(row.value).toBe('legacy_single_store');
      expect(row.updatedByUserId).toBeNull();
    });

    it('is idempotent', async () => {
      await backfillResolutionModeRow(client());
      expect((await backfillResolutionModeRow(client())).affected).toBe(0);
      expect(await prisma.platformConfig.count()).toBe(1);
    });

    it('never overwrites an operator-set value — it reports the mismatch', async () => {
      await prisma.platformConfig.create({
        data: { key: STOREFRONT_RESOLUTION_MODE_KEY, value: 'host_resolution' },
      });
      const res = await backfillResolutionModeRow(client());
      expect(res.affected).toBe(0);
      expect(res.anomalies[0]).toContain('host_resolution');
      expect(
        (
          await prisma.platformConfig.findUniqueOrThrow({
            where: { key: STOREFRONT_RESOLUTION_MODE_KEY },
          })
        ).value,
      ).toBe('host_resolution');
    });
  });

  // ─── whole run + reconciliation (§19 E-2 evidence) ──────────────────────

  describe('runAllSteps + reconciliation', () => {
    it('produces an all-PASS reconciliation for a clean multi-store database', async () => {
      const t1 = await makeTenantStore('tenant-one');
      await makeTenantStore('tenant-two');

      const results = await runAllSteps(client(), t1.tenantId, PLATFORM_DOMAIN);
      expect(results.map((r) => r.step)).toEqual(['B-1', 'B-2', 'B-3', 'B-4']);
      expect(results.flatMap((r) => r.anomalies)).toEqual([]);

      const r = await reconcile(client(), t1.tenantId);
      expect(r).toMatchObject({
        storeDomainsWithNullType: 0,
        stores: 2,
        platformSubdomainRows: 2,
        storesWithoutPlatformSubdomain: 0,
        storesWithoutPrimaryDomain: 0,
        storesWithMultiplePrimaryDomains: 0,
        tenant1PrimaryHostname: TENANT_1_CUSTOM_HOSTNAME,
        resolutionModeRow: 'legacy_single_store',
      });

      const verdicts = reconciliationVerdicts(r);
      expect(verdicts).toHaveLength(5);
      expect(verdicts.filter((v) => !v.pass)).toEqual([]);
    });

    it('a full rerun changes nothing (idempotent end to end)', async () => {
      const t1 = await makeTenantStore('tenant-one');
      await runAllSteps(client(), t1.tenantId, PLATFORM_DOMAIN);
      const before = await prisma.storeDomain.findMany({
        orderBy: { hostname: 'asc' },
      });

      const second = await runAllSteps(client(), t1.tenantId, PLATFORM_DOMAIN);
      expect(second.reduce((n, r) => n + r.affected, 0)).toBe(0);

      const after = await prisma.storeDomain.findMany({
        orderBy: { hostname: 'asc' },
      });
      expect(after).toEqual(before);
    });

    it('deletes nothing — row count only ever grows', async () => {
      const t1 = await makeTenantStore('tenant-one');
      await prisma.storeDomain.create({
        data: {
          storeId: t1.storeId,
          tenantId: t1.tenantId,
          hostname: 'pre-existing.example',
          type: 'CUSTOM',
          verificationStatus: 'PENDING',
        },
      });
      const before = await prisma.storeDomain.count();
      await runAllSteps(client(), t1.tenantId, PLATFORM_DOMAIN);
      expect(await prisma.storeDomain.count()).toBeGreaterThanOrEqual(before);
      // …and the pre-existing row still exists, untouched in status.
      expect(
        (
          await prisma.storeDomain.findUniqueOrThrow({
            where: { hostname: 'pre-existing.example' },
          })
        ).verificationStatus,
      ).toBe('PENDING');
    });

    it('reports FAIL verdicts when a store is missing its platform row (E-2 would block)', async () => {
      const t1 = await makeTenantStore('tenant-one');
      await backfillResolutionModeRow(client());
      // B-2 deliberately not run.
      const verdicts = reconciliationVerdicts(
        await reconcile(client(), t1.tenantId),
      );
      const e2 = verdicts.find((v) => v.check.includes('E-2'));
      expect(e2?.pass).toBe(false);
      expect(e2?.detail).toContain(
        'stores without a PLATFORM_SUBDOMAIN row = 1',
      );
    });

    it('runs inside a caller transaction, so a dry run can roll everything back', async () => {
      const t1 = await makeTenantStore('tenant-one');
      const SENTINEL = 'DRY_RUN_ROLLBACK';
      await expect(
        prisma.$transaction(async (tx) => {
          await runAllSteps(tx, t1.tenantId, PLATFORM_DOMAIN);
          expect(await tx.storeDomain.count()).toBeGreaterThan(0);
          throw new Error(SENTINEL);
        }),
      ).rejects.toThrow(SENTINEL);

      // Nothing persisted.
      expect(await prisma.storeDomain.count()).toBe(0);
      expect(await prisma.platformConfig.count()).toBe(0);
    });
  });
});
