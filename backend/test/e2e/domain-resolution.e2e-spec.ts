import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import type { DomainVerificationStatus, TlsStatus } from '@prisma/client';
import { PrismaService } from '../../src/common/database/prisma.service';
import { StoreDomainLookupCache } from '../../src/common/tenant/store-domain-resolution/store-domain-lookup.cache';
import { STOREFRONT_RESOLUTION_MODE_KEY } from '../../src/platform/platform-config/storefront-resolution-mode.constants';
import { StorefrontResolutionModeService } from '../../src/platform/platform-config/storefront-resolution-mode.service';
import { resetDatabase } from './support/db';
import {
  apiPath,
  authHeader,
  createPrimaryStore,
  http,
  registerAdmin,
  registerSuperAdmin,
  registerUser,
} from './support/fixtures';
import { createTestApp } from './support/test-app';

/**
 * Phase 9 W3 — spec §14.1 `domain-resolution.e2e-spec.ts` (R-1 … R-13) and
 * the §13 / §4.1.4 S-1 forgery negatives that W3 can already prove. Runs
 * through the real routes, guards and Postgres.
 *
 * Observables in W3 (no `GET /storefront/context` yet — that is W4):
 *   - `GET /settings/announcement_text` (`@Public()`, resolves the
 *     storefront scope through `StoreContextService`) — the 200/404/503
 *     outcome of the pipeline on a public route;
 *   - `GET /cart` (authenticated shopper) — the resolved `tenantId` the
 *     brand-new cart row is written with (P4-D2), read back from the DB.
 *
 * Mode is flipped through the W2 platform route, never by restarting the
 * app (P9-D8). The host→row cache is busted explicitly after direct
 * `StoreDomain` writes, standing in for the W5/W6 write paths that will
 * own that bust; §4.6's 15 s TTL is not waited on.
 *
 * W4 items deliberately NOT asserted here: I-1/I-2 (public catalog scoped
 * by store — `GET /products` is still unscoped until W4) and R-14 (client-
 * supplied `productId` anchored to the cart's tenant).
 */
describe('Phase 9 W3 — storefront domain resolution (spec §4.3 / §14.1 / S-1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cache: StoreDomainLookupCache;
  let modeService: StorefrontResolutionModeService;

  const SETTINGS = apiPath('/settings/announcement_text');
  const CART = apiPath('/cart');
  const MODE_ROUTE = apiPath('/platform/config/storefront-domain-resolution');

  interface Fixture {
    tenantId: string;
    storeId: string;
    platformHost: string;
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    cache = app.get(StoreDomainLookupCache);
    modeService = app.get(StorefrontResolutionModeService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    cache.bust();
    modeService.bust();
  });

  async function makeTenant(label: string): Promise<Fixture> {
    const tenant = await prisma.tenant.create({
      data: { slug: `${label}-${randomUUID()}` },
    });
    const storeId = await createPrimaryStore(prisma, tenant.id);
    const platformHost = `${label}-${randomUUID().slice(0, 8)}.stores.printforge.test`;
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
      verificationStatus: DomainVerificationStatus;
      tlsStatus: TlsStatus | null;
      type: 'CUSTOM' | null;
      isPrimary: boolean;
    }> = {},
  ): Promise<string> {
    const row = await prisma.storeDomain.create({
      data: {
        storeId: f.storeId,
        tenantId: f.tenantId,
        hostname,
        type: over.type === undefined ? 'CUSTOM' : over.type,
        verificationStatus: over.verificationStatus ?? 'VERIFIED',
        tlsStatus: over.tlsStatus === undefined ? 'ISSUED' : over.tlsStatus,
        isPrimary: over.isPrimary ?? false,
      },
    });
    cache.bust();
    return row.id;
  }

  async function setMode(mode: 'legacy_single_store' | 'host_resolution') {
    const superAdmin = await registerSuperAdmin(app, prisma);
    await http(app)
      .put(MODE_ROUTE)
      .set(...authHeader(superAdmin))
      .send({ mode, justification: `e2e: ${mode}` })
      .expect(200);
  }

  const settingsFrom = (origin?: string) => {
    const r = http(app).get(SETTINGS);
    return origin === undefined ? r : r.set('Origin', origin);
  };

  describe('legacy_single_store (default — pre-Phase-9 behaviour, §4.5)', () => {
    it('R-legacy: with no mode row, a shopper without any Origin is attributed to the most-recent tenant exactly as before W3', async () => {
      const older = await makeTenant('older');
      const newer = await makeTenant('newer');
      const shopper = await registerUser(app);
      await http(app)
        .get(CART)
        .set(...authHeader(shopper))
        .expect(200);
      const cart = await prisma.cart.findUniqueOrThrow({
        where: { userId: shopper.id },
      });
      expect(cart.tenantId).toBe(newer.tenantId);
      expect(cart.tenantId).not.toBe(older.tenantId);
    });

    it('R-legacy: a forged Origin is ignored in legacy mode (Host lookup, else most-recent tenant) — no 404/503 outcomes exist', async () => {
      const a = await makeTenant('a');
      const res = await settingsFrom('https://does-not-exist.example').expect(
        200,
      );
      expect(res.body.data).toEqual({ value: `announcement-for-a` });
      expect(a.tenantId).toBeDefined();
    });
  });

  describe('host_resolution (§4.3 pipeline)', () => {
    beforeEach(async () => {
      await setMode('host_resolution');
    });

    it('T1 / I-5: known PLATFORM_SUBDOMAIN origin → that store/tenant (public read scoped; cart written with that tenantId)', async () => {
      const a = await makeTenant('a');
      const b = await makeTenant('b');

      const res = await settingsFrom(`http://${a.platformHost}`).expect(200);
      expect(res.body.data).toEqual({ value: 'announcement-for-a' });
      const resB = await settingsFrom(`http://${b.platformHost}`).expect(200);
      expect(resB.body.data).toEqual({ value: 'announcement-for-b' });

      const shopper = await registerUser(app);
      await http(app)
        .get(CART)
        .set('Origin', `http://${b.platformHost}`)
        .set(...authHeader(shopper))
        .expect(200);
      const cart = await prisma.cart.findUniqueOrThrow({
        where: { userId: shopper.id },
      });
      expect(cart.tenantId).toBe(b.tenantId);
    });

    it('T2: known VERIFIED + ISSUED CUSTOM origin → that store/tenant', async () => {
      const a = await makeTenant('a');
      await addCustomDomain(a, 'shop-a.example');
      const res = await settingsFrom('http://shop-a.example').expect(200);
      expect(res.body.data).toEqual({ value: 'announcement-for-a' });
    });

    it('R-1 / T3 / T4: unknown host → 404 generic; NEVER the most-recent tenant', async () => {
      await makeTenant('a');
      const newest = await makeTenant('newest');
      const res = await settingsFrom('http://unknown.example').expect(404);
      expect(res.body).toMatchObject({
        success: false,
        error: { code: 'NOT_FOUND' },
      });
      expect(JSON.stringify(res.body)).not.toContain(newest.tenantId);

      const shopper = await registerUser(app);
      await http(app)
        .get(CART)
        .set('Origin', 'http://unknown.example')
        .set(...authHeader(shopper))
        .expect(404);
      expect(
        await prisma.cart.findUnique({ where: { userId: shopper.id } }),
      ).toBeNull();
    });

    it('R-2 / R-3: unverified or TLS-pending CUSTOM host → 404 byte-identical to unknown (S-4)', async () => {
      const a = await makeTenant('a');
      await addCustomDomain(a, 'pending.example', {
        verificationStatus: 'PENDING',
      });
      await addCustomDomain(a, 'notls.example', { tlsStatus: 'PENDING' });
      await addCustomDomain(a, 'nulltls.example', { tlsStatus: null });
      await addCustomDomain(a, 'revoked.example', {
        verificationStatus: 'FAILED',
      });

      const unknown = await settingsFrom('http://unknown.example').expect(404);
      for (const host of [
        'pending.example',
        'notls.example',
        'nulltls.example',
        'revoked.example',
      ]) {
        const res = await settingsFrom(`http://${host}`).expect(404);
        expect(res.body).toEqual(unknown.body);
      }
    });

    it('R-4 / T12: a non-primary served host is resolved with 200 — the API never issues a cross-origin 3xx', async () => {
      const a = await makeTenant('a');
      await addCustomDomain(a, 'alias.example', { isPrimary: false });
      const res = await settingsFrom('http://alias.example').expect(200);
      expect(res.headers.location).toBeUndefined();
      expect(res.body.data).toEqual({ value: 'announcement-for-a' });
    });

    it('R-5 / R-8 / T5: store DISABLED or DRAFT → 503 "unavailable" (distinct from 404), read LIVE', async () => {
      const a = await makeTenant('a');
      await settingsFrom(`http://${a.platformHost}`).expect(200); // row now cached
      await prisma.store.update({
        where: { id: a.storeId },
        data: { status: 'DISABLED' },
      });
      const res = await settingsFrom(`http://${a.platformHost}`).expect(503);
      expect(res.body).toMatchObject({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE' },
      });
      await prisma.store.update({
        where: { id: a.storeId },
        data: { status: 'DRAFT' },
      });
      await settingsFrom(`http://${a.platformHost}`).expect(503);
    });

    it('R-6 / R-7: tenant SUSPENDED or subscription EXPIRED → 503 with the same body as a disabled store', async () => {
      const a = await makeTenant('a');
      await prisma.store.update({
        where: { id: a.storeId },
        data: { status: 'DISABLED' },
      });
      const disabled = await settingsFrom(`http://${a.platformHost}`).expect(
        503,
      );
      await prisma.store.update({
        where: { id: a.storeId },
        data: { status: 'ACTIVE' },
      });

      await prisma.tenant.update({
        where: { id: a.tenantId },
        data: { status: 'SUSPENDED' },
      });
      const suspended = await settingsFrom(`http://${a.platformHost}`).expect(
        503,
      );
      expect(suspended.body).toEqual(disabled.body);
      await prisma.tenant.update({
        where: { id: a.tenantId },
        data: { status: 'ACTIVE' },
      });

      const plan = await prisma.plan.create({
        data: {
          key: `p-${randomUUID()}`,
          name: 'p',
          isActive: true,
          sortOrder: 0,
          isEnterpriseCustom: false,
        },
      });
      await prisma.subscription.create({
        data: {
          tenantId: a.tenantId,
          planId: plan.id,
          status: 'EXPIRED',
          currentPeriodStart: new Date('2026-01-01'),
          currentPeriodEnd: new Date('2026-02-01'),
        },
      });
      const expired = await settingsFrom(`http://${a.platformHost}`).expect(
        503,
      );
      expect(expired.body).toEqual(disabled.body);
    });

    it('R-9: Origin host normalisation — uppercase, port, trailing dot all resolve to the same row', async () => {
      const a = await makeTenant('a');
      await addCustomDomain(a, 'shop-a.example');
      for (const origin of [
        'http://SHOP-A.EXAMPLE',
        'http://shop-a.example:8080',
        'http://Shop-A.example.',
      ]) {
        const res = await settingsFrom(origin).expect(200);
        expect(res.body.data).toEqual({ value: 'announcement-for-a' });
      }
    });

    it('R-10: a row with type IS NULL is read as CUSTOM (fail-closed)', async () => {
      const a = await makeTenant('a');
      await addCustomDomain(a, 'untyped.example', {
        type: null,
        tlsStatus: null,
      });
      await settingsFrom('http://untyped.example').expect(404);
      await prisma.storeDomain.update({
        where: { hostname: 'untyped.example' },
        data: { tlsStatus: 'ISSUED' },
      });
      cache.bust();
      await settingsFrom('http://untyped.example').expect(200);
    });

    it('R-11: a served row revoked to FAILED is refused on the next resolution after the cache is busted', async () => {
      const a = await makeTenant('a');
      await addCustomDomain(a, 'shop-a.example');
      await settingsFrom('http://shop-a.example').expect(200);
      await prisma.storeDomain.update({
        where: { hostname: 'shop-a.example' },
        data: { verificationStatus: 'FAILED' },
      });
      cache.bust('shop-a.example');
      await settingsFrom('http://shop-a.example').expect(404);
    });

    it('R-13 / T6 / T7: absent, `null`, malformed, or API-host Origin → 404 on storefront routes; the Host header is never the signal', async () => {
      await makeTenant('a');
      await settingsFrom().expect(404); // absent Origin (supertest default)
      await settingsFrom('null').expect(404);
      await settingsFrom('shop-a.example').expect(404);
      await settingsFrom('http://shop-a.example/path').expect(404);
      await settingsFrom('ftp://shop-a.example').expect(404);
      // T7: the API's own host (what supertest sends as Host) is not a store.
      await settingsFrom('http://127.0.0.1').expect(404);
    });

    it('T9 / R-13: platform and merchant routes are unaffected by the storefront signal — no Origin, forged Origin, unknown Origin all irrelevant', async () => {
      const b = await makeTenant('b');
      const owner = await registerAdmin(app, prisma);
      const superAdmin = await registerSuperAdmin(app, prisma);
      const origins = [
        undefined,
        `http://${b.platformHost}`,
        'http://unknown.example',
        'null',
      ];
      for (const origin of origins) {
        const admin = http(app)
          .get(apiPath('/admin/dashboard'))
          .set(...authHeader(owner));
        if (origin !== undefined) {
          admin.set('Origin', origin);
        }
        await admin.expect(200);

        const platform = http(app)
          .get(apiPath('/platform/tenants'))
          .set(...authHeader(superAdmin));
        if (origin !== undefined) {
          platform.set('Origin', origin);
        }
        await platform.expect(200);
      }
    });

    it('T13: no storefront context is created before every gate passes — a gated request writes nothing', async () => {
      const a = await makeTenant('a');
      await addCustomDomain(a, 'pending.example', {
        verificationStatus: 'PENDING',
      });
      const shopper = await registerUser(app);
      await http(app)
        .get(CART)
        .set('Origin', 'http://pending.example')
        .set(...authHeader(shopper))
        .expect(404);
      await prisma.store.update({
        where: { id: a.storeId },
        data: { status: 'DISABLED' },
      });
      await http(app)
        .get(CART)
        .set('Origin', `http://${a.platformHost}`)
        .set(...authHeader(shopper))
        .expect(503);
      expect(
        await prisma.cart.findUnique({ where: { userId: shopper.id } }),
      ).toBeNull();
    });
  });

  describe('S-1 — forging Origin does not cross a tenant boundary (§4.1.4)', () => {
    beforeEach(async () => {
      await setMode('host_resolution');
    });

    it("public reads: a forged Origin selects only that store's PUBLIC data — obtainable by anyone visiting it", async () => {
      const a = await makeTenant('a');
      const b = await makeTenant('b');
      const res = await settingsFrom(`http://${b.platformHost}`).expect(200);
      expect(res.body.data).toEqual({ value: 'announcement-for-b' });
      expect(JSON.stringify(res.body)).not.toContain('announcement-for-a');
      expect(a.tenantId).not.toBe(b.tenantId);
    });

    it("shopper-owned resources stay userId-scoped: a shopper forging store B's Origin sees only their OWN cart — never another shopper's cart in B", async () => {
      const a = await makeTenant('a');
      const b = await makeTenant('b');
      const victim = await registerUser(app, 'victim');
      await http(app)
        .get(CART)
        .set('Origin', `http://${b.platformHost}`)
        .set(...authHeader(victim))
        .expect(200);
      const victimCart = await prisma.cart.findUniqueOrThrow({
        where: { userId: victim.id },
      });

      const attacker = await registerUser(app, 'attacker');
      const res = await http(app)
        .get(CART)
        .set('Origin', `http://${b.platformHost}`)
        .set(...authHeader(attacker))
        .expect(200);
      const attackerCart = await prisma.cart.findUniqueOrThrow({
        where: { userId: attacker.id },
      });
      expect(attackerCart.id).not.toBe(victimCart.id);
      expect(attackerCart.tenantId).toBe(b.tenantId); // the attacker's OWN row, under the store they claimed to visit
      expect(JSON.stringify(res.body)).not.toContain(victimCart.id);
      expect(a.tenantId).not.toBe(b.tenantId);
    });

    it("merchant authority never comes from Origin: an OWNER of tenant A forging store B's Origin still acts in A (membership, D6)", async () => {
      const b = await makeTenant('b');
      const ownerA = await registerAdmin(app, prisma);
      const res = await http(app)
        .get(apiPath('/admin/team'))
        .set('Origin', `http://${b.platformHost}`)
        .set(...authHeader(ownerA))
        .expect(200);
      const serialized = JSON.stringify(res.body);
      expect(serialized).toContain(ownerA.id);
      expect(serialized).not.toContain(b.tenantId);
    });

    it('platform authority never comes from Origin: a plain shopper forging any Origin is still 403 on /platform/*', async () => {
      const b = await makeTenant('b');
      const shopper = await registerUser(app);
      await http(app)
        .get(apiPath('/platform/tenants'))
        .set('Origin', `http://${b.platformHost}`)
        .set(...authHeader(shopper))
        .expect(403);
    });

    it('R-12: the merchant Host path is unchanged — a Host that resolves to tenant A for a caller with membership only in B falls through to B', async () => {
      const a = await makeTenant('a');
      const ownerB = await registerAdmin(app, prisma);
      const res = await http(app)
        .get(apiPath('/admin/team'))
        .set('Host', a.platformHost)
        .set(...authHeader(ownerB))
        .expect(200);
      expect(JSON.stringify(res.body)).toContain(ownerB.id);
    });
  });

  describe('T10 / T11 — the W2 kill-switch changes runtime behaviour without a restart', () => {
    it('legacy → host_resolution → legacy, observed on the same running app', async () => {
      await makeTenant('a');
      await settingsFrom('http://unknown.example').expect(200); // legacy: ignored Origin, most-recent tenant

      await setMode('host_resolution');
      await settingsFrom('http://unknown.example').expect(404); // host_resolution: no fallback

      await setMode('legacy_single_store');
      await settingsFrom('http://unknown.example').expect(200); // legacy restored

      const row = await prisma.platformConfig.findUniqueOrThrow({
        where: { key: STOREFRONT_RESOLUTION_MODE_KEY },
      });
      expect(row.value).toBe('legacy_single_store');
    });
  });
});
