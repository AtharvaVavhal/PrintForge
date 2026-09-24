import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/common/database/prisma.service';
import { StoreDomainLookupCache } from '../../src/common/tenant/store-domain-resolution/store-domain-lookup.cache';
import { StorefrontResolutionModeService } from '../../src/platform/platform-config/storefront-resolution-mode.service';
import { STORE_DOMAIN_AUDIT } from '../../src/store-domains/store-domain-audit.constants';
import { PLATFORM_DOMAIN_AUDIT } from '../../src/platform/platform-domains/platform-domains.service';
import { resetDatabase } from './support/db';
import { FakeDomainHostingProvider } from '../../src/common/tenant/store-domain-resolution/hosting/fake-domain-hosting.provider';
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
 * Phase 9 W5 — custom-domain verification, end to end (spec §6.1–§6.3, §6.4,
 * §14.2; ⚖️ P9-D2, P9-D7, P9-S2, P9-S7, S-6). Real routes, real global guard
 * chain, real Postgres; only the DNS seam is faked (`FakeDnsResolver` through
 * the `DOMAIN_DNS_RESOLVER` token), because P9-S7 requires proving that a
 * revoked domain's merchant verify performs NO DNS lookup at all.
 *
 * Covered here (the numbering is the W5 acceptance list):
 *   1  valid DNS TXT verification            9  platform restore of FAILED
 *   2  valid CNAME verification             10  tenant A cannot touch B
 *   3  invalid check stays PENDING          11  OWNER succeeds
 *   4  failure reason retained (S-6)        12  no permission → 403
 *   5  lastCheckedAt behaviour              13  settings:write ≠ authority
 *   6  merchant cannot verify FAILED        14  serving gate (§4.3)
 *   7  …making no DNS call                  15  W3/W4 isolation still green
 *   8  …and no state change                     (their own suites, unmodified)
 */
const PLATFORM_DOMAIN = 'stores.printforge.test';
const CNAME_TARGET = 'cname.printforge.test';

describe('Phase 9 W5 — store-domain verification (spec §6.3 / §6.4 / §14.2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dns: FakeDnsResolver;
  let hosting: FakeDomainHostingProvider;
  let cache: StoreDomainLookupCache;
  let modeService: StorefrontResolutionModeService;

  const DOMAINS = apiPath('/admin/store-domains');
  const SETTINGS = apiPath('/settings/announcement_text');
  const MODE_ROUTE = apiPath('/platform/config/storefront-domain-resolution');

  const platformRoute = (id: string, action: string): string =>
    apiPath(`/platform/domains/${id}/${action}`);

  beforeAll(async () => {
    // Read once by `configuration()` when the Nest app is compiled below —
    // the CNAME target and the reserved platform storefront domain are
    // ordinary environment configuration (spec §7.3), never a secret.
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
  }

  async function makeMerchant(label = 'owner'): Promise<Merchant> {
    const owner = await registerUser(app, label);
    const { tenantId } = await grantOwnerMembership(prisma, owner.id);
    const store = await prisma.store.findFirstOrThrow({
      where: { tenantId, isPrimary: true },
    });
    return { owner, tenantId, storeId: store.id };
  }

  /** Adds a domain through the REAL merchant route and returns its row + token. */
  async function addDomain(
    m: Merchant,
    hostname: string,
    verificationMethod: 'DNS_TXT' | 'CNAME' = 'DNS_TXT',
  ): Promise<{ id: string; token: string; body: Record<string, unknown> }> {
    const res = await http(app)
      .post(DOMAINS)
      .set(...authHeader(m.owner))
      .send({ hostname, verificationMethod })
      .expect(201);
    const data = res.body.data;
    return { id: data.domain.id, token: data.verificationToken, body: data };
  }

  function verify(m: Merchant, id: string) {
    return http(app)
      .post(`${DOMAINS}/${id}/verify`)
      .set(...authHeader(m.owner));
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

  /** Drives a domain all the way to VERIFIED through the real TXT flow. */
  async function verifiedDomain(
    m: Merchant,
    hostname: string,
  ): Promise<string> {
    const { id, token } = await addDomain(m, hostname);
    dns.setTxt(`_printforge-verify.${hostname}`, [token]);
    await verify(m, id).expect(200);
    return id;
  }

  // ─── A. ADD (spec §6.1 / §6.2) ───────────────────────────────────────────

  describe('A. add', () => {
    it('creates a CUSTOM, PENDING, non-primary row with a token and DNS_TXT instructions', async () => {
      const m = await makeMerchant();
      const { id, token, body } = await addDomain(m, 'shop.example');

      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(body.instructions).toMatchObject({
        method: 'DNS_TXT',
        record: '_printforge-verify.shop.example',
        value: token,
      });
      const created = await row(id);
      expect(created).toMatchObject({
        tenantId: m.tenantId,
        storeId: m.storeId,
        hostname: 'shop.example',
        type: 'CUSTOM',
        verificationStatus: 'PENDING',
        verificationMethod: 'DNS_TXT',
        tlsStatus: 'PENDING',
        isPrimary: false,
        verifiedAt: null,
        lastCheckedAt: null,
      });
      expect(
        await tenantAudit(m.tenantId, STORE_DOMAIN_AUDIT.added),
      ).toHaveLength(1);
    });

    it('returns the CNAME target as the instruction value for a CNAME row', async () => {
      const m = await makeMerchant();
      const { body } = await addDomain(m, 'shop.example', 'CNAME');
      expect(body.instructions).toMatchObject({
        method: 'CNAME',
        record: 'shop.example',
        value: CNAME_TARGET,
      });
    });

    it('never leaks the verificationToken through the list route', async () => {
      const m = await makeMerchant();
      await addDomain(m, 'shop.example');
      const res = await http(app)
        .get(DOMAINS)
        .set(...authHeader(m.owner))
        .expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(JSON.stringify(res.body.data)).not.toContain('verificationToken');
    });

    it('normalises the hostname (case, trailing dot) to the one lookup key', async () => {
      const m = await makeMerchant();
      const { id } = await addDomain(m, 'SHOP.Example.');
      expect((await row(id)).hostname).toBe('shop.example');
    });

    it.each([
      ['not a hostname', 'not_a_host'],
      ['a single label', 'localhost'],
      [
        'a hostname under the platform storefront domain',
        `x.${PLATFORM_DOMAIN}`,
      ],
      ['the platform storefront domain itself', PLATFORM_DOMAIN],
    ])('rejects %s with 400 (spec §6.2)', async (_label, hostname) => {
      const m = await makeMerchant();
      await http(app)
        .post(DOMAINS)
        .set(...authHeader(m.owner))
        .send({ hostname, verificationMethod: 'DNS_TXT' })
        .expect(400);
      expect(await prisma.storeDomain.count()).toBe(0);
    });

    it('rejects a hostname already registered by ANOTHER tenant with 409 and no leak', async () => {
      const a = await makeMerchant('a');
      const b = await makeMerchant('b');
      await addDomain(a, 'contested.example');
      const res = await http(app)
        .post(DOMAINS)
        .set(...authHeader(b.owner))
        .send({ hostname: 'contested.example', verificationMethod: 'DNS_TXT' })
        .expect(409);
      expect(JSON.stringify(res.body)).not.toContain(a.tenantId);
      expect(
        await prisma.storeDomain.count({ where: { tenantId: b.tenantId } }),
      ).toBe(0);
    });

    it('rejects an unratified verification method (P9-D2: only DNS_TXT and CNAME)', async () => {
      const m = await makeMerchant();
      await http(app)
        .post(DOMAINS)
        .set(...authHeader(m.owner))
        .send({ hostname: 'shop.example', verificationMethod: 'HTTP_FILE' })
        .expect(400);
    });
  });

  // ─── B. VERIFY — the happy paths (acceptance 1, 2, 5, 11) ────────────────

  describe('B. on-demand verification (P9-D7)', () => {
    it('1 / 11: OWNER + a matching TXT record → VERIFIED, verifiedAt and lastCheckedAt set', async () => {
      const m = await makeMerchant();
      const { id, token } = await addDomain(m, 'shop.example');
      dns.setTxt(`_printforge-verify.shop.example`, ['unrelated', token]);

      const res = await verify(m, id).expect(200);
      expect(res.body.data.verificationStatus).toBe('VERIFIED');
      expect(res.body.data.reason).toBeUndefined();

      const after = await row(id);
      expect(after.verificationStatus).toBe('VERIFIED');
      expect(after.verifiedAt).not.toBeNull();
      expect(after.lastCheckedAt).not.toBeNull();
      // Exactly one TXT lookup, at the derived record name.
      expect(dns.calls).toEqual([
        { kind: 'txt', name: '_printforge-verify.shop.example' },
      ]);
      const audit = await tenantAudit(m.tenantId, STORE_DOMAIN_AUDIT.verified);
      expect(audit).toHaveLength(1);
      expect(audit[0].targetId).toBe(id);
    });

    it('2: a matching CNAME → VERIFIED (case/trailing dot insensitive)', async () => {
      const m = await makeMerchant();
      const { id } = await addDomain(m, 'shop.example', 'CNAME');
      dns.setCname('shop.example', [`${CNAME_TARGET.toUpperCase()}.`]);

      const res = await verify(m, id).expect(200);
      expect(res.body.data.verificationStatus).toBe('VERIFIED');
      expect(dns.calls).toEqual([{ kind: 'cname', name: 'shop.example' }]);
      expect((await row(id)).verificationStatus).toBe('VERIFIED');
    });

    it('a CNAME pointing somewhere else stays PENDING with CNAME_TARGET_MISMATCH', async () => {
      const m = await makeMerchant();
      const { id } = await addDomain(m, 'shop.example', 'CNAME');
      dns.setCname('shop.example', ['someone-else.example']);
      const res = await verify(m, id).expect(200);
      expect(res.body.data).toMatchObject({
        verificationStatus: 'PENDING',
        reason: 'CNAME_TARGET_MISMATCH',
      });
    });

    it('a VERIFIED row is not re-checked in Phase 9 (409, no DNS call)', async () => {
      const m = await makeMerchant();
      const id = await verifiedDomain(m, 'shop.example');
      dns.reset();
      await verify(m, id).expect(409);
      expect(dns.calls).toHaveLength(0);
    });

    it('a PLATFORM_SUBDOMAIN row is always-on and cannot be verified (409)', async () => {
      const m = await makeMerchant();
      const platformRow = await prisma.storeDomain.create({
        data: {
          storeId: m.storeId,
          tenantId: m.tenantId,
          hostname: `shop-a.${PLATFORM_DOMAIN}`,
          type: 'PLATFORM_SUBDOMAIN',
          verificationStatus: 'VERIFIED',
          isPrimary: true,
        },
      });
      await verify(m, platformRow.id).expect(409);
      expect(dns.calls).toHaveLength(0);
    });
  });

  // ─── C. FAILURE — S-6 (acceptance 3, 4, 5) ───────────────────────────────

  describe('C. a failing check (S-6)', () => {
    it('3 / 4 / 5: stays PENDING; only lastCheckedAt moves; reason in the response AND in TenantAuditLog', async () => {
      const m = await makeMerchant();
      const { id } = await addDomain(m, 'shop.example');
      const before = await row(id);
      // No TXT record published at all.
      const res = await verify(m, id).expect(200);

      expect(res.body.data).toMatchObject({
        verificationStatus: 'PENDING',
        reason: 'TXT_RECORD_NOT_FOUND',
      });
      expect(res.body.data.lastCheckedAt).not.toBeNull();

      const after = await row(id);
      expect(after.verificationStatus).toBe('PENDING');
      expect(after.verifiedAt).toBeNull();
      expect(after.lastCheckedAt).not.toBeNull();
      // S-6: no StoreDomain column other than lastCheckedAt changed.
      expect({ ...after, lastCheckedAt: null }).toEqual({
        ...before,
        lastCheckedAt: null,
      });

      const audit = await tenantAudit(
        m.tenantId,
        STORE_DOMAIN_AUDIT.verificationFailed,
      );
      expect(audit).toHaveLength(1);
      expect(audit[0].targetId).toBe(id);
      expect(audit[0].metadata).toMatchObject({
        hostname: 'shop.example',
        method: 'DNS_TXT',
        reason: 'TXT_RECORD_NOT_FOUND',
      });
    });

    it('4: the latest failure reason is surfaced on the merchant list (S-6 retention point 2)', async () => {
      const m = await makeMerchant();
      const { id, token } = await addDomain(m, 'shop.example');
      dns.setTxt('_printforge-verify.shop.example', ['wrong-value']);
      await verify(m, id).expect(200);

      const res = await http(app)
        .get(DOMAINS)
        .set(...authHeader(m.owner))
        .expect(200);
      expect(res.body.data[0].lastVerificationFailure).toMatchObject({
        reason: 'TXT_VALUE_MISMATCH',
      });
      // …and it is superseded, not accumulated, by a later different failure.
      dns.setTxt('_printforge-verify.shop.example', []);
      await verify(m, id).expect(200);
      const res2 = await http(app)
        .get(DOMAINS)
        .set(...authHeader(m.owner))
        .expect(200);
      expect(res2.body.data[0].lastVerificationFailure.reason).toBe(
        'TXT_RECORD_NOT_FOUND',
      );
      expect(token).toBeDefined();
    });

    it('a DNS timeout is retained as DNS_TIMEOUT and still leaves the row PENDING', async () => {
      const m = await makeMerchant();
      const { id } = await addDomain(m, 'shop.example');
      dns.setFailure('_printforge-verify.shop.example', 'timeout');
      const res = await verify(m, id).expect(200);
      expect(res.body.data).toMatchObject({
        verificationStatus: 'PENDING',
        reason: 'DNS_TIMEOUT',
      });
      expect((await row(id)).verificationStatus).toBe('PENDING');
    });

    it('5: a re-verify bumps lastCheckedAt again, and a merchant NEVER writes FAILED', async () => {
      const m = await makeMerchant();
      const { id } = await addDomain(m, 'shop.example');
      await verify(m, id).expect(200);
      const first = (await row(id)).lastCheckedAt;
      await new Promise((r) => setTimeout(r, 5));
      await verify(m, id).expect(200);
      const second = (await row(id)).lastCheckedAt;

      expect(first).not.toBeNull();
      expect(second!.getTime()).toBeGreaterThan(first!.getTime());
      expect(
        await prisma.storeDomain.count({
          where: { verificationStatus: 'FAILED' },
        }),
      ).toBe(0);
    });
  });

  // ─── D. P9-S7 — sticky platform revoke (acceptance 6, 7, 8, 9) ───────────

  describe('D. sticky platform revoke (P9-S7)', () => {
    async function revokedDomain(
      m: Merchant,
      hostname = 'shop.example',
    ): Promise<{ id: string; admin: TestUser }> {
      const id = await verifiedDomain(m, hostname);
      const admin = await superAdmin();
      await http(app)
        .post(platformRoute(id, 'revoke'))
        .set(...authHeader(admin))
        .send({ justification: 'e2e: abuse report' })
        .expect(200);
      dns.reset();
      return { id, admin };
    }

    it('the platform revoke is the only path into FAILED, and it is audited', async () => {
      const m = await makeMerchant();
      const { id } = await revokedDomain(m);
      expect((await row(id)).verificationStatus).toBe('FAILED');
      const audit = await platformAudit(PLATFORM_DOMAIN_AUDIT.revoked);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        targetType: 'StoreDomain',
        targetId: id,
        tenantId: m.tenantId,
        justification: 'e2e: abuse report',
      });
      expect(audit[0].metadata).toMatchObject({
        fromStatus: 'VERIFIED',
        toStatus: 'FAILED',
      });
    });

    it('revoke requires a justification (400) and a non-VERIFIED row cannot be revoked (409)', async () => {
      const m = await makeMerchant();
      const { id } = await addDomain(m, 'shop.example');
      const admin = await superAdmin();
      await http(app)
        .post(platformRoute(id, 'revoke'))
        .set(...authHeader(admin))
        .send({})
        .expect(400);
      await http(app)
        .post(platformRoute(id, 'revoke'))
        .set(...authHeader(admin))
        .send({ justification: 'e2e' })
        .expect(409);
      expect((await row(id)).verificationStatus).toBe('PENDING');
    });

    it('6 / 7 / 8: merchant verify on a FAILED row is refused, makes NO DNS call and changes NO state', async () => {
      const m = await makeMerchant();
      const { id } = await revokedDomain(m);
      const before = await row(id);
      // A correct TXT record is published — it must not help.
      dns.setTxt('_printforge-verify.shop.example', [
        before.verificationToken!,
      ]);

      const res = await verify(m, id).expect(409);
      expect(JSON.stringify(res.body)).toContain('DOMAIN_REVOKED_BY_PLATFORM');

      // 7: zero DNS lookups — the refusal happens before the check.
      expect(dns.calls).toHaveLength(0);
      // 8: byte-for-byte the same row, including lastCheckedAt.
      expect(await row(id)).toEqual(before);

      const refusals = await tenantAudit(
        m.tenantId,
        STORE_DOMAIN_AUDIT.verifyRefusedRevoked,
      );
      expect(refusals).toHaveLength(1);
      expect(refusals[0].targetId).toBe(id);
    });

    it('a merchant cannot reach the platform revoke/override/verify routes at all (403)', async () => {
      const m = await makeMerchant();
      const id = await verifiedDomain(m, 'shop.example');
      for (const action of ['revoke', 'override', 'verify']) {
        await http(app)
          .post(platformRoute(id, action))
          .set(...authHeader(m.owner))
          .send({ justification: 'e2e: merchant attempt' })
          .expect(403);
      }
      expect((await row(id)).verificationStatus).toBe('VERIFIED');
      expect(await platformAudit(PLATFORM_DOMAIN_AUDIT.restored)).toHaveLength(
        0,
      );
    });

    it('9: the platform can restore a FAILED domain by override → VERIFIED + platform.domain.restored', async () => {
      const m = await makeMerchant();
      const { id, admin } = await revokedDomain(m);
      const res = await http(app)
        .post(platformRoute(id, 'override'))
        .set(...authHeader(admin))
        .send({ justification: 'e2e: report withdrawn' })
        .expect(200);

      expect(res.body.data.domain.verificationStatus).toBe('VERIFIED');
      expect((await row(id)).verificationStatus).toBe('VERIFIED');
      const audit = await platformAudit(PLATFORM_DOMAIN_AUDIT.restored);
      expect(audit).toHaveLength(1);
      expect(audit[0].metadata).toMatchObject({
        fromStatus: 'FAILED',
        toStatus: 'VERIFIED',
      });
      // Restoring performs no DNS lookup — it is a manual approval.
      expect(dns.calls).toHaveLength(0);
    });

    it('9: the platform can restore a FAILED domain by a PASSING re-verify → platform.domain.reverified', async () => {
      const m = await makeMerchant();
      const { id, admin } = await revokedDomain(m);
      const revoked = await row(id);
      dns.setTxt('_printforge-verify.shop.example', [
        revoked.verificationToken!,
      ]);

      await http(app)
        .post(platformRoute(id, 'verify'))
        .set(...authHeader(admin))
        .send({ justification: 'e2e: re-checked DNS' })
        .expect(200);

      expect((await row(id)).verificationStatus).toBe('VERIFIED');
      expect(dns.calls).toHaveLength(1);
      const audit = await platformAudit(PLATFORM_DOMAIN_AUDIT.reverified);
      expect(audit).toHaveLength(1);
      expect(audit[0].metadata).toMatchObject({ restored: true });
    });

    it('a FAILING platform re-verify leaves the row FAILED (never downgraded to PENDING)', async () => {
      const m = await makeMerchant();
      const { id, admin } = await revokedDomain(m);
      // No TXT record published.
      await http(app)
        .post(platformRoute(id, 'verify'))
        .set(...authHeader(admin))
        .send({ justification: 'e2e: re-check' })
        .expect(200);

      const after = await row(id);
      expect(after.verificationStatus).toBe('FAILED');
      expect(after.lastCheckedAt).not.toBeNull();
      const audit = await platformAudit(PLATFORM_DOMAIN_AUDIT.reverified);
      expect(audit[0].metadata).toMatchObject({
        fromStatus: 'FAILED',
        toStatus: 'FAILED',
        reason: 'TXT_RECORD_NOT_FOUND',
      });
    });

    it('a platform override on a PENDING row is an approval, audited as verification_overridden', async () => {
      const m = await makeMerchant();
      const { id } = await addDomain(m, 'shop.example');
      const admin = await superAdmin();
      await http(app)
        .post(platformRoute(id, 'override'))
        .set(...authHeader(admin))
        .send({ justification: 'e2e: manual approval' })
        .expect(200);
      expect((await row(id)).verificationStatus).toBe('VERIFIED');
      expect(
        await platformAudit(PLATFORM_DOMAIN_AUDIT.verificationOverridden),
      ).toHaveLength(1);
      expect(await platformAudit(PLATFORM_DOMAIN_AUDIT.restored)).toHaveLength(
        0,
      );
    });

    it('a platform re-verify that passes on a PENDING row verifies it without a restore marker', async () => {
      const m = await makeMerchant();
      const { id, token } = await addDomain(m, 'shop.example');
      dns.setTxt('_printforge-verify.shop.example', [token]);
      const admin = await superAdmin();
      await http(app)
        .post(platformRoute(id, 'verify'))
        .set(...authHeader(admin))
        .send({ justification: 'e2e: assist merchant' })
        .expect(200);
      expect((await row(id)).verificationStatus).toBe('VERIFIED');
      const audit = await platformAudit(PLATFORM_DOMAIN_AUDIT.reverified);
      expect(audit[0].metadata).toMatchObject({ restored: false });
    });

    it('DomainVerificationStatus never takes a value outside {PENDING, VERIFIED, FAILED} across the whole flow (G-5)', async () => {
      const m = await makeMerchant();
      const { id, admin } = await revokedDomain(m);
      await http(app)
        .post(platformRoute(id, 'override'))
        .set(...authHeader(admin))
        .send({ justification: 'e2e' })
        .expect(200);
      const statuses = await prisma.storeDomain.findMany({
        select: { verificationStatus: true },
      });
      for (const s of statuses) {
        expect(['PENDING', 'VERIFIED', 'FAILED']).toContain(
          s.verificationStatus,
        );
      }
    });
  });

  // ─── E. AUTHORIZATION — P9-S2 (acceptance 11, 12, 13) ────────────────────

  describe('E. authorization (P9-S2 — store-domain:manage, OWNER-only)', () => {
    async function memberOf(
      m: Merchant,
      role: 'ADMIN' | 'STAFF' | 'VIEWER',
    ): Promise<TestUser> {
      const member = await registerUser(app, role.toLowerCase());
      await grantMembership(prisma, member.id, m.tenantId, role);
      return member;
    }

    it('11: OWNER (the only role granted store-domain:manage) reaches every route', async () => {
      const m = await makeMerchant();
      await http(app)
        .get(DOMAINS)
        .set(...authHeader(m.owner))
        .expect(200);
      const { id, token } = await addDomain(m, 'shop.example');
      dns.setTxt('_printforge-verify.shop.example', [token]);
      await verify(m, id).expect(200);
    });

    it.each(['ADMIN', 'STAFF', 'VIEWER'] as const)(
      '12: %s has no store-domain:manage → 403 on list, add and verify',
      async (role) => {
        const m = await makeMerchant();
        const { id } = await addDomain(m, 'shop.example');
        const member = await memberOf(m, role);

        await http(app)
          .get(DOMAINS)
          .set(...authHeader(member))
          .expect(403);
        await http(app)
          .post(DOMAINS)
          .set(...authHeader(member))
          .send({ hostname: 'other.example', verificationMethod: 'DNS_TXT' })
          .expect(403);
        await http(app)
          .post(`${DOMAINS}/${id}/verify`)
          .set(...authHeader(member))
          .expect(403);

        expect(dns.calls).toHaveLength(0);
        expect(await prisma.storeDomain.count()).toBe(1);
      },
    );

    it('13: settings:write alone does not grant domain-management authority', async () => {
      const m = await makeMerchant();
      // ADMIN is the highest role that holds `settings:write` and does NOT
      // hold `store-domain:manage` (permission.ts — excluded from
      // ADMIN_PERMISSIONS exactly like members:manage). Proven both ways:
      // the same caller succeeds on a settings:write route and is refused
      // on the domain routes, so the 403 is about the permission, not the
      // membership, the tenant or the guard chain.
      const admin = await memberOf(m, 'ADMIN');
      await http(app)
        .patch(apiPath('/admin/settings/announcement_text'))
        .set(...authHeader(admin))
        .send({ value: 'settings:write works for this caller' })
        .expect(200);
      await http(app)
        .get(DOMAINS)
        .set(...authHeader(admin))
        .expect(403);
    });

    it('a shopper with no membership at all gets 403; unauthenticated gets 401', async () => {
      const shopper = await registerUser(app, 'shopper');
      await http(app)
        .get(DOMAINS)
        .set(...authHeader(shopper))
        .expect(403);
      await http(app).get(DOMAINS).expect(401);
    });

    it('a SUPER_ADMIN does not automatically become a tenant domain manager (invariant 4)', async () => {
      const admin = await superAdmin();
      await http(app)
        .get(DOMAINS)
        .set(...authHeader(admin))
        .expect(403);
    });

    it('a non-SUPER_ADMIN cannot reach the platform revoke/override/verify routes (403)', async () => {
      const m = await makeMerchant();
      const id = await verifiedDomain(m, 'shop.example');
      const shopper = await registerUser(app, 'shopper');
      for (const action of ['revoke', 'override', 'verify']) {
        await http(app)
          .post(platformRoute(id, action))
          .set(...authHeader(shopper))
          .send({ justification: 'e2e' })
          .expect(403);
        await http(app)
          .post(platformRoute(id, action))
          .send({ justification: 'e2e' })
          .expect(401);
      }
      expect((await row(id)).verificationStatus).toBe('VERIFIED');
    });
  });

  // ─── F. TENANT ISOLATION (acceptance 10) ─────────────────────────────────

  describe('F. tenant isolation', () => {
    it("10: tenant A's list contains only A's domains", async () => {
      const a = await makeMerchant('a');
      const b = await makeMerchant('b');
      await addDomain(a, 'shop-a.example');
      await addDomain(b, 'shop-b.example');

      const res = await http(app)
        .get(DOMAINS)
        .set(...authHeader(a.owner))
        .expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].hostname).toBe('shop-a.example');
      expect(JSON.stringify(res.body.data)).not.toContain('shop-b.example');
    });

    it("10: tenant A cannot verify tenant B's domain — 404, indistinguishable from nonexistent, no DNS call, no state change", async () => {
      const a = await makeMerchant('a');
      const b = await makeMerchant('b');
      const { id: bId, token } = await addDomain(b, 'shop-b.example');
      const bBefore = await row(bId);
      dns.setTxt('_printforge-verify.shop-b.example', [token]);

      const cross = await http(app)
        .post(`${DOMAINS}/${bId}/verify`)
        .set(...authHeader(a.owner))
        .expect(404);
      const absent = await http(app)
        .post(`${DOMAINS}/00000000-0000-4000-8000-000000000000/verify`)
        .set(...authHeader(a.owner))
        .expect(404);
      expect(cross.body.message).toEqual(absent.body.message);

      expect(dns.calls).toHaveLength(0);
      expect(await row(bId)).toEqual(bBefore);
      expect(
        await tenantAudit(a.tenantId, STORE_DOMAIN_AUDIT.verifyRefusedRevoked),
      ).toHaveLength(0);
    });

    it('10: tenant A cannot reach a FAILED domain of tenant B through the revoked-row branch either', async () => {
      const a = await makeMerchant('a');
      const b = await makeMerchant('b');
      const bId = await verifiedDomain(b, 'shop-b.example');
      const admin = await superAdmin();
      await http(app)
        .post(platformRoute(bId, 'revoke'))
        .set(...authHeader(admin))
        .send({ justification: 'e2e' })
        .expect(200);
      dns.reset();

      // A 404 (not found), NOT the 409 DOMAIN_REVOKED_BY_PLATFORM a tenant
      // of B's own would get — the revoke state of another tenant's domain
      // is not observable, and no audit row is written under A.
      const res = await http(app)
        .post(`${DOMAINS}/${bId}/verify`)
        .set(...authHeader(a.owner))
        .expect(404);
      expect(JSON.stringify(res.body)).not.toContain(
        'DOMAIN_REVOKED_BY_PLATFORM',
      );
      expect(
        await prisma.tenantAuditLog.count({ where: { tenantId: a.tenantId } }),
      ).toBe(0);
      expect((await row(bId)).verificationStatus).toBe('FAILED');
    });

    it("10: a tenant's own audit trail never contains another tenant's domain events", async () => {
      const a = await makeMerchant('a');
      const b = await makeMerchant('b');
      await addDomain(a, 'shop-a.example');
      await addDomain(b, 'shop-b.example');
      const aAudit = await prisma.tenantAuditLog.findMany({
        where: { tenantId: a.tenantId },
      });
      expect(aAudit).toHaveLength(1);
      expect(JSON.stringify(aAudit)).not.toContain('shop-b.example');
    });
  });

  // ─── H. SCHEMA (spec §14.2 — the shape W5's semantics depend on) ─────────

  describe('H. schema', () => {
    /**
     * §14.2's "a schema assertion that `store_domains` gained exactly four
     * columns". It belongs with the verification tests rather than with W1's
     * migration guard because S-6 and P9-S7 are defined BY the absence of the
     * columns a lazier implementation would have added: a free-text
     * verification-reason column (S-6 keeps the reason in the verify response,
     * `TenantAuditLog` and the log instead) and a revoke marker (P9-S7:
     * "Do not create a new schema field solely for this decision").
     */
    it('store_domains has exactly the pre-W1 columns plus the four ratified ones — no reason column, no revoke marker', async () => {
      const rows = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'store_domains'
        ORDER BY column_name
      `;
      const columns = rows.map((r) => r.column_name);
      expect(columns).toEqual([
        'createdAt',
        'hostname',
        'id',
        'isPrimary',
        // ── the four P9-D2-ratified additions ──
        'lastCheckedAt',
        'storeId',
        'tenantId',
        'tlsStatus',
        'type',
        'verificationMethod',
        // ───────────────────────────────────────
        'verificationStatus',
        'verificationToken',
        'verifiedAt',
      ]);
    });

    it('the four ratified columns are all nullable with no database default (G-19 shape)', async () => {
      const rows = await prisma.$queryRaw<
        {
          column_name: string;
          is_nullable: string;
          column_default: string | null;
        }[]
      >`
        SELECT column_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'store_domains'
          AND column_name IN ('type', 'verificationMethod', 'lastCheckedAt', 'tlsStatus')
      `;
      expect(rows).toHaveLength(4);
      for (const col of rows) {
        expect(col.is_nullable).toBe('YES');
        expect(col.column_default).toBeNull();
      }
    });

    it('the DomainVerificationStatus enum type in the database is exactly {PENDING, VERIFIED, FAILED} (G-5)', async () => {
      const rows = await prisma.$queryRaw<{ label: string }[]>`
        SELECT e.enumlabel AS label
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'DomainVerificationStatus'
        ORDER BY e.enumlabel
      `;
      expect(rows.map((r) => r.label)).toEqual([
        'FAILED',
        'PENDING',
        'VERIFIED',
      ]);
    });
  });

  // ─── G. SERVING GATE (acceptance 14; spec §4.3) ──────────────────────────

  describe('G. serving gate (spec §4.3)', () => {
    async function setHostResolution(): Promise<void> {
      const admin = await superAdmin();
      await http(app)
        .put(MODE_ROUTE)
        .set(...authHeader(admin))
        .send({ mode: 'host_resolution', justification: 'e2e: W5 gate' })
        .expect(200);
    }

    /** Gives the merchant's store a served PLATFORM_SUBDOMAIN + a setting. */
    async function makeServableMerchant(label: string): Promise<Merchant> {
      const m = await makeMerchant(label);
      await prisma.storeDomain.create({
        data: {
          storeId: m.storeId,
          tenantId: m.tenantId,
          hostname: `${label}.${PLATFORM_DOMAIN}`,
          type: 'PLATFORM_SUBDOMAIN',
          verificationStatus: 'VERIFIED',
          isPrimary: true,
        },
      });
      await prisma.storeSetting.create({
        data: {
          tenantId: m.tenantId,
          storeId: m.storeId,
          key: 'announcement_text',
          value: `announcement-for-${label}`,
        },
      });
      cache.bust();
      return m;
    }

    const settingsFrom = (host: string) =>
      http(app).get(SETTINGS).set('Origin', `http://${host}`);

    it('14: a VERIFIED CUSTOM domain is still NOT served while tlsStatus is PENDING (W6 issues it)', async () => {
      await setHostResolution();
      const m = await makeServableMerchant('gate-a');
      await verifiedDomain(m, 'shop-gate-a.example');
      cache.bust();

      await settingsFrom('shop-gate-a.example').expect(404);
      // …while the always-on platform subdomain of the same store serves.
      const ok = await settingsFrom(`gate-a.${PLATFORM_DOMAIN}`).expect(200);
      expect(ok.body.data).toEqual({ value: 'announcement-for-gate-a' });
    });

    it('14: VERIFIED + ISSUED serves that store; PENDING + ISSUED does not', async () => {
      await setHostResolution();
      const m = await makeServableMerchant('gate-b');
      const verifiedId = await verifiedDomain(m, 'served.example');
      const { id: pendingId } = await addDomain(m, 'unverified.example');
      await prisma.storeDomain.updateMany({
        where: { id: { in: [verifiedId, pendingId] } },
        data: { tlsStatus: 'ISSUED' },
      });
      cache.bust();

      const served = await settingsFrom('served.example').expect(200);
      expect(served.body.data).toEqual({ value: 'announcement-for-gate-b' });
      await settingsFrom('unverified.example').expect(404);
    });

    it('14: a platform revoke stops a served custom domain immediately (cache busted on write, R-11)', async () => {
      await setHostResolution();
      const m = await makeServableMerchant('gate-c');
      const id = await verifiedDomain(m, 'revoke-me.example');
      await prisma.storeDomain.update({
        where: { id },
        data: { tlsStatus: 'ISSUED' },
      });
      cache.bust();
      await settingsFrom('revoke-me.example').expect(200);

      const admin = await superAdmin();
      await http(app)
        .post(platformRoute(id, 'revoke'))
        .set(...authHeader(admin))
        .send({ justification: 'e2e: stop serving' })
        .expect(200);

      // No cache.bust() here — the service must have busted it itself.
      await settingsFrom('revoke-me.example').expect(404);
    });

    it('14: a platform restore brings the host back without waiting for the TTL', async () => {
      await setHostResolution();
      const m = await makeServableMerchant('gate-d');
      const id = await verifiedDomain(m, 'restore-me.example');
      await prisma.storeDomain.update({
        where: { id },
        data: { tlsStatus: 'ISSUED' },
      });
      cache.bust();
      const admin = await superAdmin();
      await http(app)
        .post(platformRoute(id, 'revoke'))
        .set(...authHeader(admin))
        .send({ justification: 'e2e' })
        .expect(200);
      await settingsFrom('restore-me.example').expect(404);

      await http(app)
        .post(platformRoute(id, 'override'))
        .set(...authHeader(admin))
        .send({ justification: 'e2e: restore' })
        .expect(200);
      const back = await settingsFrom('restore-me.example').expect(200);
      expect(back.body.data).toEqual({ value: 'announcement-for-gate-d' });
    });

    it('14: PLATFORM_SUBDOMAIN behaviour is unchanged — always-on, tlsStatus never consulted', async () => {
      await setHostResolution();
      const m = await makeServableMerchant('gate-e');
      await prisma.storeDomain.updateMany({
        where: { tenantId: m.tenantId, type: 'PLATFORM_SUBDOMAIN' },
        data: { tlsStatus: 'ERROR', verificationStatus: 'PENDING' },
      });
      cache.bust();
      const res = await settingsFrom(`gate-e.${PLATFORM_DOMAIN}`).expect(200);
      expect(res.body.data).toEqual({ value: 'announcement-for-gate-e' });
    });
  });
});
