import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/common/database/prisma.service';
import { FakeDomainHostingProvider } from '../../src/common/tenant/store-domain-resolution/hosting/fake-domain-hosting.provider';
import { StoreDomainLookupCache } from '../../src/common/tenant/store-domain-resolution/store-domain-lookup.cache';
import { StorefrontResolutionModeService } from '../../src/platform/platform-config/storefront-resolution-mode.service';
import { resetDatabase } from './support/db';
import { FakeDnsResolver } from './support/fake-dns-resolver';
import {
  apiPath,
  authHeader,
  createPrimaryStore,
  grantOwnerMembership,
  http,
  registerSuperAdmin,
  registerUser,
  TestUser,
} from './support/fixtures';
import { createTestAppWithCors } from './support/test-app';
import { randomUUID } from 'crypto';

/**
 * Phase 9 W7 — CORS over real HTTP (spec §9, §14.4; ⚖️ S-9). The app is built
 * with the SAME `buildCorsOptions` wiring `main.ts` installs, so every
 * assertion here reads `Access-Control-Allow-Origin` off an actual response or
 * preflight rather than trusting the predicate in isolation
 * (`storefront-cors.policy.spec.ts` covers the branch matrix).
 *
 * `.env.test` sets `NODE_ENV=test`, so the predicate is in its non-production
 * configuration: `http` and ports are admissible, which is what lets a
 * loopback e2e request carry a realistic storefront `Origin`.
 */
const PLATFORM_DOMAIN = 'stores.printforge.test';

describe('Phase 9 W7 — CORS origin predicate (spec §9 / §14.4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dns: FakeDnsResolver;
  let hosting: FakeDomainHostingProvider;
  let cache: StoreDomainLookupCache;
  let modeService: StorefrontResolutionModeService;
  let frontendOrigin: string;

  const SETTINGS = apiPath('/settings/announcement_text');
  const CONTEXT = apiPath('/storefront/context');
  const MODE_ROUTE = apiPath('/platform/config/storefront-domain-resolution');
  const CORS_CHECK = apiPath('/platform/config/cors-check');

  beforeAll(async () => {
    process.env.PLATFORM_STOREFRONT_DOMAIN = PLATFORM_DOMAIN;
    ({ app, prisma, dns, hosting } = await createTestAppWithCors());
    cache = app.get(StoreDomainLookupCache);
    modeService = app.get(StorefrontResolutionModeService);
    // The exact value `configuration.ts` resolved — the predicate's
    // always-allowed platform admin origin.
    frontendOrigin = process.env.FRONTEND_URL ?? 'http://localhost:5173';
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

  interface Fixture {
    tenantId: string;
    storeId: string;
    platformHost: string;
  }

  async function makeStore(label: string): Promise<Fixture> {
    const tenant = await prisma.tenant.create({
      data: { slug: `${label}-${randomUUID()}` },
    });
    const storeId = await createPrimaryStore(prisma, tenant.id);
    const platformHost = `${label}-${randomUUID().slice(0, 8)}.${PLATFORM_DOMAIN}`;
    await prisma.storeDomain.create({
      data: {
        storeId,
        tenantId: tenant.id,
        hostname: platformHost,
        type: 'PLATFORM_SUBDOMAIN',
        verificationStatus: 'VERIFIED',
        isPrimary: true,
      },
    });
    await prisma.storeSetting.create({
      data: {
        tenantId: tenant.id,
        storeId,
        key: 'announcement_text',
        value: `announcement-for-${label}`,
      },
    });
    cache.bust();
    return { tenantId: tenant.id, storeId, platformHost };
  }

  async function addCustomDomain(
    f: Fixture,
    hostname: string,
    over: Partial<{
      verificationStatus: 'PENDING' | 'VERIFIED' | 'FAILED';
      tlsStatus: 'PENDING' | 'ISSUED' | 'ERROR' | null;
    }> = {},
  ): Promise<string> {
    const created = await prisma.storeDomain.create({
      data: {
        storeId: f.storeId,
        tenantId: f.tenantId,
        hostname,
        type: 'CUSTOM',
        verificationStatus: over.verificationStatus ?? 'VERIFIED',
        tlsStatus: over.tlsStatus === undefined ? 'ISSUED' : over.tlsStatus,
        isPrimary: false,
      },
    });
    cache.bust();
    return created.id;
  }

  async function superAdmin(): Promise<TestUser> {
    return registerSuperAdmin(app, prisma);
  }

  async function setMode(
    mode: 'legacy_single_store' | 'host_resolution',
  ): Promise<void> {
    const admin = await superAdmin();
    await http(app)
      .put(MODE_ROUTE)
      .set(...authHeader(admin))
      .send({ mode, justification: `e2e: W7 ${mode}` })
      .expect(200);
  }

  /** The `Access-Control-Allow-Origin` a real GET receives for `origin`. */
  async function allowOriginHeader(
    origin: string,
  ): Promise<string | undefined> {
    const res = await http(app).get(SETTINGS).set('Origin', origin);
    return res.headers['access-control-allow-origin'];
  }

  /** …and what the browser's own preflight receives. */
  async function preflightAllowOrigin(origin: string): Promise<{
    allowOrigin?: string;
    allowCredentials?: string;
    status: number;
  }> {
    const res = await http(app)
      .options(SETTINGS)
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET');
    return {
      allowOrigin: res.headers['access-control-allow-origin'],
      allowCredentials: res.headers['access-control-allow-credentials'],
      status: res.status,
    };
  }

  // ─── A. legacy_single_store (S-9) ────────────────────────────────────────

  describe('A. legacy_single_store — exactly the pre-Phase-9 allow-list', () => {
    beforeEach(async () => {
      await setMode('legacy_single_store');
    });

    it('admits the FRONTEND_URL origin, with credentials', async () => {
      expect(await allowOriginHeader(frontendOrigin)).toBe(frontendOrigin);
      const pre = await preflightAllowOrigin(frontendOrigin);
      expect(pre.allowOrigin).toBe(frontendOrigin);
      expect(pre.allowCredentials).toBe('true');
    });

    it('DENIES a platform subdomain origin (no misrouting window)', async () => {
      const f = await makeStore('legacy-a');
      expect(
        await allowOriginHeader(`http://${f.platformHost}`),
      ).toBeUndefined();
    });

    it('DENIES a fully verified + issued custom origin', async () => {
      const f = await makeStore('legacy-b');
      await addCustomDomain(f, 'served-legacy.example');
      expect(
        await allowOriginHeader('http://served-legacy.example'),
      ).toBeUndefined();
    });

    it('a denied preflight carries no allow-origin header at all', async () => {
      const f = await makeStore('legacy-c');
      const pre = await preflightAllowOrigin(`http://${f.platformHost}`);
      expect(pre.allowOrigin).toBeUndefined();
    });
  });

  // ─── B. host_resolution (§9 allow-list) ─────────────────────────────────

  describe('B. host_resolution — the dynamic allow-list', () => {
    beforeEach(async () => {
      await setMode('host_resolution');
    });

    it('admits the platform admin origin', async () => {
      expect(await allowOriginHeader(frontendOrigin)).toBe(frontendOrigin);
    });

    it('admits a one-label platform subdomain', async () => {
      const f = await makeStore('hr-a');
      const origin = `http://${f.platformHost}`;
      expect(await allowOriginHeader(origin)).toBe(origin);
    });

    it('denies a two-label platform subdomain', async () => {
      await makeStore('hr-b');
      expect(
        await allowOriginHeader(`http://a.b.${PLATFORM_DOMAIN}`),
      ).toBeUndefined();
    });

    it('admits a VERIFIED + ISSUED custom origin', async () => {
      const f = await makeStore('hr-c');
      await addCustomDomain(f, 'served.example');
      expect(await allowOriginHeader('http://served.example')).toBe(
        'http://served.example',
      );
    });

    it('denies a VERIFIED custom origin whose TLS is still PENDING', async () => {
      const f = await makeStore('hr-d');
      await addCustomDomain(f, 'no-tls.example', { tlsStatus: 'PENDING' });
      expect(await allowOriginHeader('http://no-tls.example')).toBeUndefined();
    });

    it('denies a PENDING custom origin', async () => {
      const f = await makeStore('hr-e');
      await addCustomDomain(f, 'unverified.example', {
        verificationStatus: 'PENDING',
      });
      expect(
        await allowOriginHeader('http://unverified.example'),
      ).toBeUndefined();
    });

    it('denies an unknown origin', async () => {
      await makeStore('hr-f');
      expect(await allowOriginHeader('http://evil.example')).toBeUndefined();
    });

    it.each([
      ['the literal null', 'null'],
      ['a path-bearing value', 'http://served.example/evil'],
      ['a bare hostname', 'served.example'],
      ['a wildcard', '*'],
    ])('denies %s', async (_label, origin) => {
      const f = await makeStore('hr-g');
      await addCustomDomain(f, 'served.example');
      expect(await allowOriginHeader(origin)).toBeUndefined();
    });

    it('never emits a wildcard allow-origin, and retains credentials on an allowed origin', async () => {
      const f = await makeStore('hr-h');
      const origin = `http://${f.platformHost}`;
      const res = await http(app).get(SETTINGS).set('Origin', origin);
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      // `Vary: Origin` is what keeps a shared cache from serving one store's
      // CORS headers to another store's browser.
      expect(res.headers['vary']).toContain('Origin');
    });

    it('a request with NO Origin is unaffected (not a CORS request)', async () => {
      await makeStore('hr-i');
      const res = await http(app).get(apiPath('/health'));
      expect(res.status).toBe(200);
    });
  });

  // ─── C. revoked / unserved interplay with the serving gate ──────────────

  describe('C. revoked and unserved domains', () => {
    beforeEach(async () => {
      await setMode('host_resolution');
    });

    it('a platform revoke removes CORS admission as well as serving', async () => {
      const f = await makeStore('revoke');
      const id = await addCustomDomain(f, 'revoke-me.example');
      const origin = 'http://revoke-me.example';
      expect(await allowOriginHeader(origin)).toBe(origin);

      const admin = await superAdmin();
      await http(app)
        .post(apiPath(`/platform/domains/${id}/revoke`))
        .set(...authHeader(admin))
        .send({ justification: 'e2e: W7 revoke' })
        .expect(200);

      // No explicit cache bust here — the revoke path busts it, and CORS
      // reads the very same cached row (§4.6, one lookup).
      expect(await allowOriginHeader(origin)).toBeUndefined();
      await http(app).get(SETTINGS).set('Origin', origin).expect(404);
    });

    it('an unserved custom origin is denied by CORS and 404s at the resolver — consistently', async () => {
      const f = await makeStore('unserved');
      await addCustomDomain(f, 'pending.example', { tlsStatus: 'PENDING' });
      const origin = 'http://pending.example';
      expect(await allowOriginHeader(origin)).toBeUndefined();
      await http(app).get(SETTINGS).set('Origin', origin).expect(404);
    });

    it('a SUSPENDED tenant keeps CORS admission so the browser can read the 503', async () => {
      const f = await makeStore('suspended');
      const origin = `http://${f.platformHost}`;
      await prisma.tenant.update({
        where: { id: f.tenantId },
        data: { status: 'SUSPENDED' },
      });
      cache.bust();

      const res = await http(app).get(SETTINGS).set('Origin', origin);
      expect(res.status).toBe(503);
      // Were CORS to deny here, the browser would show an opaque CORS error
      // instead of the store-unavailable response (§4.3).
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    });
  });

  // ─── D. dry-run (§9 pre-flip verification) ──────────────────────────────

  describe('D. GET /platform/config/cors-check', () => {
    it('returns the host_resolution verdict while legacy mode is in force, and changes nothing', async () => {
      await setMode('legacy_single_store');
      const f = await makeStore('dry-a');
      await addCustomDomain(f, 'served-dry.example');
      const admin = await superAdmin();
      const origin = 'http://served-dry.example';

      const res = await http(app)
        .get(`${CORS_CHECK}?origin=${encodeURIComponent(origin)}`)
        .set(...authHeader(admin))
        .expect(200);

      expect(res.body.data).toMatchObject({
        origin,
        evaluatedAs: 'host_resolution',
        allowed: true,
        reason: 'custom_domain_served',
      });
      // Live CORS is still legacy-restricted — the dry-run opened nothing.
      expect(await allowOriginHeader(origin)).toBeUndefined();
      // …and the tested origin is not echoed onto the dry-run response either.
      expect(res.headers['access-control-allow-origin']).not.toBe(origin);
    });

    it('reports each W8-step-5 case with a machine reason', async () => {
      await setMode('legacy_single_store');
      const f = await makeStore('dry-b');
      await addCustomDomain(f, 'served-b.example');
      await addCustomDomain(f, 'pending-b.example', { tlsStatus: 'PENDING' });
      const admin = await superAdmin();

      const check = async (origin: string) => {
        const res = await http(app)
          .get(`${CORS_CHECK}?origin=${encodeURIComponent(origin)}`)
          .set(...authHeader(admin))
          .expect(200);
        return res.body.data as { allowed: boolean; reason: string };
      };

      expect(await check(frontendOrigin)).toEqual({
        allowed: true,
        reason: 'platform_admin_origin',
        origin: frontendOrigin,
        evaluatedAs: 'host_resolution',
      });
      expect((await check(`http://${f.platformHost}`)).reason).toBe(
        'platform_subdomain',
      );
      expect((await check('http://served-b.example')).allowed).toBe(true);
      expect(await check('http://pending-b.example')).toMatchObject({
        allowed: false,
        reason: 'custom_domain_not_served',
      });
      expect(await check('http://unknown-host.example')).toMatchObject({
        allowed: false,
        reason: 'unknown_host',
      });
      expect(await check('not-an-origin')).toMatchObject({
        allowed: false,
        reason: 'malformed_origin',
      });
      expect((await check(`http://a.b.${PLATFORM_DOMAIN}`)).reason).toBe(
        'platform_subdomain_too_deep',
      );
    });

    it('requires SUPER_ADMIN — a tenant OWNER and a shopper are both 403', async () => {
      const owner = await registerUser(app, 'owner');
      await grantOwnerMembership(prisma, owner.id);
      const shopper = await registerUser(app, 'shopper');
      const url = `${CORS_CHECK}?origin=${encodeURIComponent(frontendOrigin)}`;

      await http(app)
        .get(url)
        .set(...authHeader(owner))
        .expect(403);
      await http(app)
        .get(url)
        .set(...authHeader(shopper))
        .expect(403);
      await http(app).get(url).expect(401);
    });

    it('rejects a missing origin parameter with 400', async () => {
      const admin = await superAdmin();
      await http(app)
        .get(CORS_CHECK)
        .set(...authHeader(admin))
        .expect(400);
    });
  });

  // ─── E. CORS is not authorization ───────────────────────────────────────

  describe('E. CORS is not an authorization mechanism', () => {
    beforeEach(async () => {
      await setMode('host_resolution');
    });

    it('an admitted storefront Origin grants no merchant access', async () => {
      const f = await makeStore('authz');
      const shopper = await registerUser(app, 'shopper');
      // The Origin is on the allow-list…
      const origin = `http://${f.platformHost}`;
      expect(await allowOriginHeader(origin)).toBe(origin);

      // …and confers nothing: no membership, no permission, no tenant.
      await http(app)
        .get(apiPath('/admin/store-domains'))
        .set('Origin', origin)
        .set(...authHeader(shopper))
        .expect(403);
      await http(app)
        .get(apiPath('/platform/domains'))
        .set('Origin', origin)
        .set(...authHeader(shopper))
        .expect(403);
      await http(app)
        .get(apiPath('/admin/store-domains'))
        .set('Origin', origin)
        .expect(401);
    });

    it("a forged Origin naming another store does not reach that store's data", async () => {
      const a = await makeStore('forge-a');
      const b = await makeStore('forge-b');
      // B's origin is genuinely on the allow-list, and the resolver serves
      // exactly B — never A — regardless of who sent the header.
      const res = await http(app)
        .get(SETTINGS)
        .set('Origin', `http://${b.platformHost}`)
        .expect(200);
      expect(res.body.data).toEqual({ value: 'announcement-for-forge-b' });
      expect(JSON.stringify(res.body)).not.toContain('forge-a');
      expect(a.tenantId).not.toBe(b.tenantId);
    });

    it('a denied Origin does not stop a non-browser client — the serving gate does', async () => {
      const f = await makeStore('nonbrowser');
      await addCustomDomain(f, 'pending-nb.example', { tlsStatus: 'PENDING' });
      // No Origin header at all: CORS is irrelevant, and the request is
      // refused because no store scope can be derived, not because of CORS.
      await http(app).get(SETTINGS).expect(404);
      // With the unserved Origin: still 404 from the gate.
      await http(app)
        .get(SETTINGS)
        .set('Origin', 'http://pending-nb.example')
        .expect(404);
    });
  });

  // ─── F. the API never cross-origin redirects (§11) ──────────────────────

  describe('F. the API never redirects a storefront request', () => {
    beforeEach(async () => {
      await setMode('host_resolution');
    });

    it('a non-primary served host gets 200 + canonicalOrigin, never a 301/302', async () => {
      const f = await makeStore('canon');
      await addCustomDomain(f, 'secondary.example');
      const origin = 'http://secondary.example';

      const ctx = await http(app)
        .get(CONTEXT)
        .set('Origin', origin)
        .expect(200);
      expect(ctx.body.data.isPrimary).toBe(false);
      expect(ctx.body.data.canonicalOrigin).toBe(`http://${f.platformHost}`);

      // The SPA redirects itself (§11); the API does not.
      for (const route of [SETTINGS, CONTEXT]) {
        const res = await http(app).get(route).set('Origin', origin);
        expect([301, 302, 303, 307, 308]).not.toContain(res.status);
        expect(res.headers['location']).toBeUndefined();
      }
    });

    it('no storefront route 3xx-redirects for an unknown or unserved host either', async () => {
      await makeStore('noredirect');
      for (const origin of ['http://evil.example', 'null']) {
        const res = await http(app).get(SETTINGS).set('Origin', origin);
        expect(res.status).toBe(404);
        expect(res.headers['location']).toBeUndefined();
      }
    });
  });
});
