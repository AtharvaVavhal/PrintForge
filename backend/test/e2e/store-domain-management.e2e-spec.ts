import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/common/database/prisma.service';
import { FakeDomainHostingProvider } from '../../src/common/tenant/store-domain-resolution/hosting/fake-domain-hosting.provider';
import { StoreDomainLookupCache } from '../../src/common/tenant/store-domain-resolution/store-domain-lookup.cache';
import { StorefrontResolutionModeService } from '../../src/platform/platform-config/storefront-resolution-mode.service';
import { PLATFORM_DOMAIN_AUDIT } from '../../src/platform/platform-domains/platform-domains.service';
import { STORE_DOMAIN_AUDIT } from '../../src/store-domains/store-domain-audit.constants';
import { resetDatabase } from './support/db';
import { FakeDnsResolver } from './support/fake-dns-resolver';
import {
  apiPath,
  authHeader,
  grantMembership,
  grantOwnerMembership,
  http,
  registerSuperAdmin,
  registerUser,
  TestUser,
} from './support/fixtures';
import { createTestAppWithDomainFakes } from './support/test-app';

/**
 * Phase 9 W6 — primary / platform domain management, end to end (spec §6.1
 * set-primary / remove / refresh-TLS, §6.4 list / inspect / remove, §7 the
 * hosting seam, §5 platform-subdomain provisioning). Real routes, real global
 * guard chain, real Postgres; the DNS and hosting seams are the two fakes.
 *
 * W5's verification flow has its own suite
 * (`store-domain-verification.e2e-spec.ts`) and is not re-asserted here.
 */
const PLATFORM_DOMAIN = 'stores.printforge.test';
const CNAME_TARGET = 'cname.printforge.test';

describe('Phase 9 W6 — store-domain management (spec §6.1 / §6.4 / §7 / §5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dns: FakeDnsResolver;
  let hosting: FakeDomainHostingProvider;
  let cache: StoreDomainLookupCache;
  let modeService: StorefrontResolutionModeService;

  const DOMAINS = apiPath('/admin/store-domains');
  const PLATFORM_DOMAINS = apiPath('/platform/domains');
  const SETTINGS = apiPath('/settings/announcement_text');
  const MODE_ROUTE = apiPath('/platform/config/storefront-domain-resolution');

  beforeAll(async () => {
    process.env.PLATFORM_STOREFRONT_DOMAIN = PLATFORM_DOMAIN;
    process.env.PLATFORM_CUSTOM_DOMAIN_CNAME_TARGET = CNAME_TARGET;
    ({ app, prisma, dns, hosting } = await createTestAppWithDomainFakes());
    cache = app.get(StoreDomainLookupCache);
    modeService = app.get(StorefrontResolutionModeService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    dns.reset();
    hosting.reset();
    cache.bust();
    modeService.bust();
  });

  // ─── fixtures ────────────────────────────────────────────────────────────

  interface Merchant {
    owner: TestUser;
    tenantId: string;
    storeId: string;
    storeSlug: string;
    platformHost: string;
  }

  /** An OWNER on a tenant whose store has its §5 PLATFORM_SUBDOMAIN row. */
  async function makeMerchant(label = 'owner'): Promise<Merchant> {
    const owner = await registerUser(app, label);
    const { tenantId } = await grantOwnerMembership(prisma, owner.id);
    const store = await prisma.store.findFirstOrThrow({
      where: { tenantId, isPrimary: true },
    });
    const platformHost = `${store.slug}.${PLATFORM_DOMAIN}`;
    await prisma.storeDomain.create({
      data: {
        storeId: store.id,
        tenantId,
        hostname: platformHost,
        type: 'PLATFORM_SUBDOMAIN',
        verificationStatus: 'VERIFIED',
        verificationMethod: null,
        tlsStatus: null,
        isPrimary: true,
      },
    });
    await prisma.storeSetting.create({
      data: {
        tenantId,
        storeId: store.id,
        key: 'announcement_text',
        value: `announcement-for-${label}`,
      },
    });
    cache.bust();
    return {
      owner,
      tenantId,
      storeId: store.id,
      storeSlug: store.slug,
      platformHost,
    };
  }

  async function superAdmin(): Promise<TestUser> {
    return registerSuperAdmin(app, prisma);
  }

  async function row(id: string) {
    return prisma.storeDomain.findUniqueOrThrow({ where: { id } });
  }

  async function tenantAudit(tenantId: string, action: string) {
    return prisma.tenantAuditLog.findMany({
      where: { tenantId, action },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function platformAudit(action: string) {
    return prisma.platformAuditLog.findMany({
      where: { action },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Add + verify a CUSTOM domain through the real merchant routes. */
  async function verifiedDomain(
    m: Merchant,
    hostname: string,
  ): Promise<string> {
    const added = await http(app)
      .post(DOMAINS)
      .set(...authHeader(m.owner))
      .send({ hostname, verificationMethod: 'DNS_TXT' })
      .expect(201);
    const id = added.body.data.domain.id as string;
    dns.setTxt(`_printforge-verify.${hostname}`, [
      added.body.data.verificationToken as string,
    ]);
    await http(app)
      .post(`${DOMAINS}/${id}/verify`)
      .set(...authHeader(m.owner))
      .expect(200);
    return id;
  }

  /** …and take it all the way to serveable (VERIFIED + ISSUED). */
  async function issuedDomain(m: Merchant, hostname: string): Promise<string> {
    const id = await verifiedDomain(m, hostname);
    hosting.markIssued(hostname);
    await http(app)
      .post(`${DOMAINS}/${id}/tls-refresh`)
      .set(...authHeader(m.owner))
      .expect(200);
    return id;
  }

  // ─── A. POST-VERIFICATION PROVIDER ATTACH (spec §6.3 final ¶, §7.2) ──────

  describe('A. provider attach on VERIFIED', () => {
    it('a passing verification attaches the hostname at the provider and mirrors its state', async () => {
      const m = await makeMerchant();
      const id = await verifiedDomain(m, 'shop.example');

      expect(hosting.calls).toEqual([{ op: 'add', hostname: 'shop.example' }]);
      expect(hosting.isAttached('shop.example')).toBe(true);
      // Attached but no certificate yet → PENDING, i.e. still not served.
      expect((await row(id)).tlsStatus).toBe('PENDING');
    });

    it('a provider failure leaves the row VERIFIED with tlsStatus=ERROR (§6.3)', async () => {
      const m = await makeMerchant();
      hosting.failFor('shop.example');
      const id = await verifiedDomain(m, 'shop.example');

      const after = await row(id);
      expect(after.verificationStatus).toBe('VERIFIED');
      expect(after.tlsStatus).toBe('ERROR');
    });

    it('a FAILING verification never touches the provider', async () => {
      const m = await makeMerchant();
      const added = await http(app)
        .post(DOMAINS)
        .set(...authHeader(m.owner))
        .send({ hostname: 'shop.example', verificationMethod: 'DNS_TXT' })
        .expect(201);
      await http(app)
        .post(`${DOMAINS}/${added.body.data.domain.id}/verify`)
        .set(...authHeader(m.owner))
        .expect(200);
      expect(hosting.calls).toHaveLength(0);
    });
  });

  // ─── B. REFRESH TLS (spec §6.1 / §7.2) ───────────────────────────────────

  describe('B. refresh TLS status', () => {
    it('advances PENDING → ISSUED once the provider reports a certificate, and audits it', async () => {
      const m = await makeMerchant();
      const id = await verifiedDomain(m, 'shop.example');
      hosting.markIssued('shop.example');

      const res = await http(app)
        .post(`${DOMAINS}/${id}/tls-refresh`)
        .set(...authHeader(m.owner))
        .expect(200);

      expect(res.body.data.tlsStatus).toBe('ISSUED');
      expect((await row(id)).tlsStatus).toBe('ISSUED');
      const audit = await tenantAudit(
        m.tenantId,
        STORE_DOMAIN_AUDIT.tlsRefreshed,
      );
      expect(audit).toHaveLength(1);
      expect(audit[0].metadata).toMatchObject({
        hostname: 'shop.example',
        fromTlsStatus: 'PENDING',
        toTlsStatus: 'ISSUED',
      });
    });

    it('records a provider certificate error as ERROR rather than failing the request', async () => {
      const m = await makeMerchant();
      const id = await verifiedDomain(m, 'shop.example');
      hosting.markCertificateError('shop.example');
      await http(app)
        .post(`${DOMAINS}/${id}/tls-refresh`)
        .set(...authHeader(m.owner))
        .expect(200);
      expect((await row(id)).tlsStatus).toBe('ERROR');
    });

    it('records a provider OUTAGE as ERROR too (still fail-closed, retryable)', async () => {
      const m = await makeMerchant();
      const id = await verifiedDomain(m, 'shop.example');
      hosting.failFor('shop.example');
      await http(app)
        .post(`${DOMAINS}/${id}/tls-refresh`)
        .set(...authHeader(m.owner))
        .expect(200);
      expect((await row(id)).tlsStatus).toBe('ERROR');
    });

    it('refuses on a PLATFORM_SUBDOMAIN — the wildcard covers it (§7.2)', async () => {
      const m = await makeMerchant();
      const platformRow = await prisma.storeDomain.findFirstOrThrow({
        where: { tenantId: m.tenantId, type: 'PLATFORM_SUBDOMAIN' },
      });
      await http(app)
        .post(`${DOMAINS}/${platformRow.id}/tls-refresh`)
        .set(...authHeader(m.owner))
        .expect(409);
      expect(hosting.calls).toHaveLength(0);
      expect((await row(platformRow.id)).tlsStatus).toBeNull();
    });
  });

  // ─── C. SET PRIMARY (spec §6.1 / §11) ────────────────────────────────────

  describe('C. set primary', () => {
    it('moves primary to a VERIFIED + ISSUED custom domain, clearing the old one, and audits', async () => {
      const m = await makeMerchant();
      const id = await issuedDomain(m, 'shop.example');

      const res = await http(app)
        .post(`${DOMAINS}/${id}/primary`)
        .set(...authHeader(m.owner))
        .expect(200);

      expect(res.body.data.isPrimary).toBe(true);
      const primaries = await prisma.storeDomain.findMany({
        where: { storeId: m.storeId, isPrimary: true },
      });
      expect(primaries).toHaveLength(1);
      expect(primaries[0].hostname).toBe('shop.example');

      const audit = await tenantAudit(
        m.tenantId,
        STORE_DOMAIN_AUDIT.primaryChanged,
      );
      expect(audit).toHaveLength(1);
      expect(audit[0].metadata).toMatchObject({
        hostname: 'shop.example',
        previousHostname: m.platformHost,
      });
    });

    it('refuses a domain that is not VERIFIED (409) — an unserved host must never be canonical', async () => {
      const m = await makeMerchant();
      const added = await http(app)
        .post(DOMAINS)
        .set(...authHeader(m.owner))
        .send({ hostname: 'shop.example', verificationMethod: 'DNS_TXT' })
        .expect(201);
      const id = added.body.data.domain.id as string;
      await http(app)
        .post(`${DOMAINS}/${id}/primary`)
        .set(...authHeader(m.owner))
        .expect(409);
      expect((await row(id)).isPrimary).toBe(false);
    });

    it('refuses a VERIFIED domain whose certificate is not ISSUED (409) — the §4.3 gate, asked as a question', async () => {
      const m = await makeMerchant();
      const id = await verifiedDomain(m, 'shop.example');
      expect((await row(id)).tlsStatus).toBe('PENDING');
      await http(app)
        .post(`${DOMAINS}/${id}/primary`)
        .set(...authHeader(m.owner))
        .expect(409);
      expect((await row(id)).isPrimary).toBe(false);
      // The platform subdomain is still the one primary.
      const primaries = await prisma.storeDomain.findMany({
        where: { storeId: m.storeId, isPrimary: true },
      });
      expect(primaries[0].hostname).toBe(m.platformHost);
    });

    it('allows a PLATFORM_SUBDOMAIN to be made primary again (always-on, TLS not consulted)', async () => {
      const m = await makeMerchant();
      const custom = await issuedDomain(m, 'shop.example');
      await http(app)
        .post(`${DOMAINS}/${custom}/primary`)
        .set(...authHeader(m.owner))
        .expect(200);

      const platformRow = await prisma.storeDomain.findFirstOrThrow({
        where: { tenantId: m.tenantId, type: 'PLATFORM_SUBDOMAIN' },
      });
      await http(app)
        .post(`${DOMAINS}/${platformRow.id}/primary`)
        .set(...authHeader(m.owner))
        .expect(200);
      expect((await row(platformRow.id)).isPrimary).toBe(true);
      expect((await row(custom)).isPrimary).toBe(false);
    });

    it('rejects re-setting the domain that is already primary (409), leaving exactly one primary', async () => {
      const m = await makeMerchant();
      const platformRow = await prisma.storeDomain.findFirstOrThrow({
        where: { tenantId: m.tenantId, type: 'PLATFORM_SUBDOMAIN' },
      });
      await http(app)
        .post(`${DOMAINS}/${platformRow.id}/primary`)
        .set(...authHeader(m.owner))
        .expect(409);
      expect(
        await prisma.storeDomain.count({
          where: { storeId: m.storeId, isPrimary: true },
        }),
      ).toBe(1);
    });

    it('the store never has two primaries — the partial unique index is never violated', async () => {
      const m = await makeMerchant();
      const a = await issuedDomain(m, 'a.example');
      const b = await issuedDomain(m, 'b.example');
      await http(app)
        .post(`${DOMAINS}/${a}/primary`)
        .set(...authHeader(m.owner))
        .expect(200);
      await http(app)
        .post(`${DOMAINS}/${b}/primary`)
        .set(...authHeader(m.owner))
        .expect(200);
      expect(
        await prisma.storeDomain.count({
          where: { storeId: m.storeId, isPrimary: true },
        }),
      ).toBe(1);
      expect((await row(b)).isPrimary).toBe(true);
    });
  });

  // ─── D. REMOVE (spec §6.1 / §7.2) ────────────────────────────────────────

  describe('D. remove', () => {
    it('detaches at the provider, deletes the row and audits it', async () => {
      const m = await makeMerchant();
      const id = await issuedDomain(m, 'shop.example');
      hosting.calls.length = 0;

      const res = await http(app)
        .delete(`${DOMAINS}/${id}`)
        .set(...authHeader(m.owner))
        .expect(200);

      expect(res.body.data).toMatchObject({
        removed: true,
        hostname: 'shop.example',
        newPrimaryHostname: null,
      });
      expect(hosting.calls).toEqual([
        { op: 'remove', hostname: 'shop.example' },
      ]);
      expect(await prisma.storeDomain.findUnique({ where: { id } })).toBeNull();
      const audit = await tenantAudit(m.tenantId, STORE_DOMAIN_AUDIT.removed);
      expect(audit).toHaveLength(1);
      expect(audit[0].metadata).toMatchObject({
        hostname: 'shop.example',
        wasPrimary: false,
      });
    });

    it('removing the PRIMARY custom domain promotes the platform subdomain', async () => {
      const m = await makeMerchant();
      const id = await issuedDomain(m, 'shop.example');
      await http(app)
        .post(`${DOMAINS}/${id}/primary`)
        .set(...authHeader(m.owner))
        .expect(200);

      const res = await http(app)
        .delete(`${DOMAINS}/${id}`)
        .set(...authHeader(m.owner))
        .expect(200);

      expect(res.body.data.newPrimaryHostname).toBe(m.platformHost);
      const primaries = await prisma.storeDomain.findMany({
        where: { storeId: m.storeId, isPrimary: true },
      });
      expect(primaries).toHaveLength(1);
      expect(primaries[0].hostname).toBe(m.platformHost);
    });

    it('refuses to remove a PLATFORM_SUBDOMAIN (409) — merchants never remove them (§5)', async () => {
      const m = await makeMerchant();
      const platformRow = await prisma.storeDomain.findFirstOrThrow({
        where: { tenantId: m.tenantId, type: 'PLATFORM_SUBDOMAIN' },
      });
      await http(app)
        .delete(`${DOMAINS}/${platformRow.id}`)
        .set(...authHeader(m.owner))
        .expect(409);
      expect(hosting.calls).toHaveLength(0);
      await expect(row(platformRow.id)).resolves.toBeTruthy();
    });

    it('refuses when the row is primary and there is no platform subdomain to fall back to', async () => {
      const m = await makeMerchant();
      const id = await issuedDomain(m, 'shop.example');
      await http(app)
        .post(`${DOMAINS}/${id}/primary`)
        .set(...authHeader(m.owner))
        .expect(200);
      // Simulate a Store predating W6 provisioning (its §16 backfill unrun).
      await prisma.storeDomain.deleteMany({
        where: { storeId: m.storeId, type: 'PLATFORM_SUBDOMAIN' },
      });
      hosting.calls.length = 0;

      await http(app)
        .delete(`${DOMAINS}/${id}`)
        .set(...authHeader(m.owner))
        .expect(409);

      // Nothing was detached and the row is intact — never a primary-less store.
      expect(hosting.calls).toHaveLength(0);
      expect((await row(id)).isPrimary).toBe(true);
    });

    it('a provider outage aborts the removal with the row untouched (§7.2)', async () => {
      const m = await makeMerchant();
      const id = await issuedDomain(m, 'shop.example');
      hosting.failFor('shop.example');

      await http(app)
        .delete(`${DOMAINS}/${id}`)
        .set(...authHeader(m.owner))
        .expect(503);

      await expect(row(id)).resolves.toMatchObject({
        hostname: 'shop.example',
      });
      expect(
        await tenantAudit(m.tenantId, STORE_DOMAIN_AUDIT.removed),
      ).toHaveLength(0);
    });
  });

  // ─── E. AUTHORIZATION (P9-S2 — the W6 routes too) ────────────────────────

  describe('E. authorization', () => {
    it.each(['ADMIN', 'STAFF', 'VIEWER'] as const)(
      '%s has no store-domain:manage → 403 on primary, tls-refresh and delete',
      async (role) => {
        const m = await makeMerchant();
        const id = await issuedDomain(m, 'shop.example');
        const member = await registerUser(app, role.toLowerCase());
        await grantMembership(prisma, member.id, m.tenantId, role);
        hosting.calls.length = 0;

        await http(app)
          .post(`${DOMAINS}/${id}/primary`)
          .set(...authHeader(member))
          .expect(403);
        await http(app)
          .post(`${DOMAINS}/${id}/tls-refresh`)
          .set(...authHeader(member))
          .expect(403);
        await http(app)
          .delete(`${DOMAINS}/${id}`)
          .set(...authHeader(member))
          .expect(403);

        expect(hosting.calls).toHaveLength(0);
        expect((await row(id)).isPrimary).toBe(false);
      },
    );

    it('unauthenticated gets 401 on every W6 merchant route', async () => {
      const m = await makeMerchant();
      const id = await issuedDomain(m, 'shop.example');
      await http(app).post(`${DOMAINS}/${id}/primary`).expect(401);
      await http(app).post(`${DOMAINS}/${id}/tls-refresh`).expect(401);
      await http(app).delete(`${DOMAINS}/${id}`).expect(401);
    });

    it('a non-SUPER_ADMIN cannot list, inspect or remove through /platform/domains', async () => {
      const m = await makeMerchant();
      const id = await issuedDomain(m, 'shop.example');
      await http(app)
        .get(PLATFORM_DOMAINS)
        .set(...authHeader(m.owner))
        .expect(403);
      await http(app)
        .get(`${PLATFORM_DOMAINS}/${id}`)
        .set(...authHeader(m.owner))
        .expect(403);
      await http(app)
        .delete(`${PLATFORM_DOMAINS}/${id}`)
        .set(...authHeader(m.owner))
        .send({ justification: 'e2e: merchant attempt' })
        .expect(403);
      await expect(row(id)).resolves.toBeTruthy();
    });
  });

  // ─── F. TENANT ISOLATION (the W6 routes too) ─────────────────────────────

  describe('F. tenant isolation', () => {
    it("tenant A cannot set primary, refresh TLS or remove tenant B's domain — 404, no provider call, no change", async () => {
      const a = await makeMerchant('a');
      const b = await makeMerchant('b');
      const bId = await issuedDomain(b, 'shop-b.example');
      const before = await row(bId);
      hosting.calls.length = 0;

      await http(app)
        .post(`${DOMAINS}/${bId}/primary`)
        .set(...authHeader(a.owner))
        .expect(404);
      await http(app)
        .post(`${DOMAINS}/${bId}/tls-refresh`)
        .set(...authHeader(a.owner))
        .expect(404);
      await http(app)
        .delete(`${DOMAINS}/${bId}`)
        .set(...authHeader(a.owner))
        .expect(404);

      expect(hosting.calls).toHaveLength(0);
      expect(await row(bId)).toEqual(before);
      expect(
        await prisma.tenantAuditLog.count({ where: { tenantId: a.tenantId } }),
      ).toBe(0);
    });

    it('a cross-tenant id is indistinguishable from a nonexistent one', async () => {
      const a = await makeMerchant('a');
      const b = await makeMerchant('b');
      const bId = await issuedDomain(b, 'shop-b.example');
      const cross = await http(app)
        .delete(`${DOMAINS}/${bId}`)
        .set(...authHeader(a.owner))
        .expect(404);
      const absent = await http(app)
        .delete(`${DOMAINS}/00000000-0000-4000-8000-000000000000`)
        .set(...authHeader(a.owner))
        .expect(404);
      expect(cross.body.message).toEqual(absent.body.message);
    });
  });

  // ─── G. PLATFORM LIST / INSPECT / REMOVE (spec §6.4) ─────────────────────

  describe('G. platform surface', () => {
    it("lists every tenant's domains with owner metadata, and never a verificationToken", async () => {
      const a = await makeMerchant('a');
      const b = await makeMerchant('b');
      await verifiedDomain(a, 'shop-a.example');
      await verifiedDomain(b, 'shop-b.example');
      const admin = await superAdmin();

      const res = await http(app)
        .get(PLATFORM_DOMAINS)
        .set(...authHeader(admin))
        .expect(200);

      // `ResponseInterceptor` lifts a PaginatedResult's `items` to `data` and
      // its `meta` to the envelope's top level (§21).
      const hostnames = (res.body.data as { hostname: string }[]).map(
        (d) => d.hostname,
      );
      expect(hostnames).toContain('shop-a.example');
      expect(hostnames).toContain('shop-b.example');
      expect(hostnames).toContain(a.platformHost);
      expect(res.body.meta.total).toBe(4);
      expect(JSON.stringify(res.body.data)).not.toContain('verificationToken');
      const one = (res.body.data as { hostname: string }[]).find(
        (d) => d.hostname === 'shop-a.example',
      );
      expect(one).toMatchObject({
        tenantId: a.tenantId,
        storeId: a.storeId,
        storeSlug: a.storeSlug,
      });
    });

    it('filters by tenantId, type, verificationStatus and tlsStatus', async () => {
      const a = await makeMerchant('a');
      const b = await makeMerchant('b');
      await issuedDomain(a, 'issued-a.example');
      await verifiedDomain(a, 'pending-a.example');
      await verifiedDomain(b, 'shop-b.example');
      const admin = await superAdmin();

      const q = async (query: string) => {
        const res = await http(app)
          .get(`${PLATFORM_DOMAINS}?${query}`)
          .set(...authHeader(admin))
          .expect(200);
        return (res.body.data as { hostname: string }[]).map((d) => d.hostname);
      };

      expect((await q(`tenantId=${b.tenantId}`)).sort()).toEqual(
        [b.platformHost, 'shop-b.example'].sort(),
      );
      expect((await q('type=PLATFORM_SUBDOMAIN')).sort()).toEqual(
        [a.platformHost, b.platformHost].sort(),
      );
      expect(await q('tlsStatus=ISSUED')).toEqual(['issued-a.example']);
      expect((await q('type=CUSTOM&tlsStatus=PENDING')).sort()).toEqual(
        ['pending-a.example', 'shop-b.example'].sort(),
      );
      expect(await q('verificationStatus=FAILED')).toEqual([]);
    });

    it('rejects an unknown filter value with 400 rather than silently ignoring it', async () => {
      const admin = await superAdmin();
      await http(app)
        .get(`${PLATFORM_DOMAINS}?tlsStatus=DEFINITELY_NOT_A_STATUS`)
        .set(...authHeader(admin))
        .expect(400);
    });

    it('inspect returns the row, the LIVE provider status and the last verification failure (S-6)', async () => {
      const m = await makeMerchant();
      const id = await verifiedDomain(m, 'shop.example');
      // Produce a failure reason to retrieve: a second domain that fails.
      const failing = await http(app)
        .post(DOMAINS)
        .set(...authHeader(m.owner))
        .send({ hostname: 'failing.example', verificationMethod: 'DNS_TXT' })
        .expect(201);
      await http(app)
        .post(`${DOMAINS}/${failing.body.data.domain.id}/verify`)
        .set(...authHeader(m.owner))
        .expect(200);

      const admin = await superAdmin();
      hosting.markIssued('shop.example');

      const res = await http(app)
        .get(`${PLATFORM_DOMAINS}/${id}`)
        .set(...authHeader(admin))
        .expect(200);

      // The live read sees ISSUED even though the STORED value is still PENDING
      // (nothing polls — P9-D7); Inspect reports both and mutates neither.
      expect(res.body.data.providerStatus).toMatchObject({
        configured: true,
        certificate: 'issued',
      });
      expect(res.body.data.tlsStatus).toBe('PENDING');
      expect((await row(id)).tlsStatus).toBe('PENDING');

      const failed = await http(app)
        .get(`${PLATFORM_DOMAINS}/${failing.body.data.domain.id}`)
        .set(...authHeader(admin))
        .expect(200);
      expect(failed.body.data.lastVerificationFailure).toMatchObject({
        reason: 'TXT_RECORD_NOT_FOUND',
      });
    });

    it('inspect does not call the provider for a PLATFORM_SUBDOMAIN (§7.2 wildcard)', async () => {
      const m = await makeMerchant();
      const platformRow = await prisma.storeDomain.findFirstOrThrow({
        where: { tenantId: m.tenantId, type: 'PLATFORM_SUBDOMAIN' },
      });
      const admin = await superAdmin();
      hosting.calls.length = 0;

      const res = await http(app)
        .get(`${PLATFORM_DOMAINS}/${platformRow.id}`)
        .set(...authHeader(admin))
        .expect(200);

      expect(res.body.data.providerStatus).toBeNull();
      expect(hosting.calls).toHaveLength(0);
    });

    it('inspect reports a provider outage without failing the request', async () => {
      const m = await makeMerchant();
      const id = await verifiedDomain(m, 'shop.example');
      hosting.failFor('shop.example');
      const admin = await superAdmin();

      const res = await http(app)
        .get(`${PLATFORM_DOMAINS}/${id}`)
        .set(...authHeader(admin))
        .expect(200);
      expect(res.body.data.providerStatus).toBeNull();
      expect(res.body.data.providerError).toContain('FAKE');
    });

    it('inspect 404s on an unknown id', async () => {
      const admin = await superAdmin();
      await http(app)
        .get(`${PLATFORM_DOMAINS}/00000000-0000-4000-8000-000000000000`)
        .set(...authHeader(admin))
        .expect(404);
    });

    it('platform remove works on any tenant, requires a justification, and audits', async () => {
      const m = await makeMerchant();
      const id = await issuedDomain(m, 'shop.example');
      const admin = await superAdmin();

      await http(app)
        .delete(`${PLATFORM_DOMAINS}/${id}`)
        .set(...authHeader(admin))
        .send({})
        .expect(400);

      await http(app)
        .delete(`${PLATFORM_DOMAINS}/${id}`)
        .set(...authHeader(admin))
        .send({ justification: 'e2e: abuse takedown' })
        .expect(200);

      expect(await prisma.storeDomain.findUnique({ where: { id } })).toBeNull();
      const audit = await platformAudit(PLATFORM_DOMAIN_AUDIT.removed);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        targetId: id,
        tenantId: m.tenantId,
        justification: 'e2e: abuse takedown',
      });
    });

    it('platform remove refuses a PLATFORM_SUBDOMAIN, and refuses to orphan a primary', async () => {
      const m = await makeMerchant();
      const platformRow = await prisma.storeDomain.findFirstOrThrow({
        where: { tenantId: m.tenantId, type: 'PLATFORM_SUBDOMAIN' },
      });
      const admin = await superAdmin();
      await http(app)
        .delete(`${PLATFORM_DOMAINS}/${platformRow.id}`)
        .set(...authHeader(admin))
        .send({ justification: 'e2e' })
        .expect(409);

      const id = await issuedDomain(m, 'shop.example');
      await http(app)
        .post(`${DOMAINS}/${id}/primary`)
        .set(...authHeader(m.owner))
        .expect(200);
      await prisma.storeDomain.delete({ where: { id: platformRow.id } });
      await http(app)
        .delete(`${PLATFORM_DOMAINS}/${id}`)
        .set(...authHeader(admin))
        .send({ justification: 'e2e' })
        .expect(409);
      await expect(row(id)).resolves.toBeTruthy();
    });
  });

  // ─── H. SERVING / CANONICAL EFFECTS (spec §4.3 / §11) ────────────────────

  describe('H. serving and canonical effects', () => {
    async function setHostResolution(): Promise<void> {
      const admin = await superAdmin();
      await http(app)
        .put(MODE_ROUTE)
        .set(...authHeader(admin))
        .send({ mode: 'host_resolution', justification: 'e2e: W6' })
        .expect(200);
    }

    const settingsFrom = (host: string) =>
      http(app).get(SETTINGS).set('Origin', `http://${host}`);

    it('a domain becomes served only after refresh-TLS reports ISSUED — no manual DB edit anywhere', async () => {
      await setHostResolution();
      const m = await makeMerchant('gate');
      const id = await verifiedDomain(m, 'shop.example');

      await settingsFrom('shop.example').expect(404);
      hosting.markIssued('shop.example');
      await http(app)
        .post(`${DOMAINS}/${id}/tls-refresh`)
        .set(...authHeader(m.owner))
        .expect(200);

      const res = await settingsFrom('shop.example').expect(200);
      expect(res.body.data).toEqual({ value: 'announcement-for-gate' });
    });

    it('set-primary changes canonicalOrigin for EVERY host of the store within the same request', async () => {
      await setHostResolution();
      const m = await makeMerchant('canon');
      const id = await issuedDomain(m, 'shop.example');

      const before = await http(app)
        .get(apiPath('/storefront/context'))
        .set('Origin', `http://shop.example`)
        .expect(200);
      expect(before.body.data.canonicalOrigin).toBe(`http://${m.platformHost}`);

      await http(app)
        .post(`${DOMAINS}/${id}/primary`)
        .set(...authHeader(m.owner))
        .expect(200);

      // No cache.bust() here — set-primary must have busted every host itself,
      // including the platform subdomain whose cached row carries the OLD
      // primaryHostname.
      for (const host of ['shop.example', m.platformHost]) {
        const after = await http(app)
          .get(apiPath('/storefront/context'))
          .set('Origin', `http://${host}`)
          .expect(200);
        expect(after.body.data.canonicalOrigin).toBe('http://shop.example');
      }
    });

    it('a removed domain stops resolving immediately, and the promoted primary serves', async () => {
      await setHostResolution();
      const m = await makeMerchant('gone');
      const id = await issuedDomain(m, 'shop.example');
      await http(app)
        .post(`${DOMAINS}/${id}/primary`)
        .set(...authHeader(m.owner))
        .expect(200);
      await settingsFrom('shop.example').expect(200);

      await http(app)
        .delete(`${DOMAINS}/${id}`)
        .set(...authHeader(m.owner))
        .expect(200);

      await settingsFrom('shop.example').expect(404);
      const platform = await settingsFrom(m.platformHost).expect(200);
      expect(platform.body.data).toEqual({ value: 'announcement-for-gone' });
      const ctx = await http(app)
        .get(apiPath('/storefront/context'))
        .set('Origin', `http://${m.platformHost}`)
        .expect(200);
      expect(ctx.body.data.canonicalOrigin).toBe(`http://${m.platformHost}`);
    });
  });
});
