import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/common/database/prisma.service';
import { StoreDomainLookupCache } from '../../src/common/tenant/store-domain-resolution/store-domain-lookup.cache';
import { StorefrontResolutionModeService } from '../../src/platform/platform-config/storefront-resolution-mode.service';
import { resetDatabase } from './support/db';
import {
  apiPath,
  authHeader,
  createPrimaryStore,
  http,
  registerSuperAdmin,
} from './support/fixtures';
import { createTestApp } from './support/test-app';

/**
 * Phase 9 §12 — per-store `robots.txt` / `sitemap.xml` over real HTTP, real
 * guards and real Postgres (§19 E-5: "robots.txt/sitemap.xml differ between
 * two hosts"; §18.1 canary: the robots body must carry a `Sitemap:` line).
 *
 * The routes are normally reached through the `vercel.json` edge rewrite, which
 * carries the matched host as `?host=`; these tests exercise that signal
 * directly, plus the S-12 `x-forwarded-host` fallback and the `Origin`
 * fallback, because a crawler sends no `Origin` at all.
 */
const PLATFORM_DOMAIN = 'stores.printforge.test';

describe('Phase 9 §12 — per-store SEO files', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cache: StoreDomainLookupCache;
  let modeService: StorefrontResolutionModeService;

  const ROBOTS = apiPath('/storefront/seo/robots.txt');
  const SITEMAP = apiPath('/storefront/seo/sitemap.xml');
  const MODE_ROUTE = apiPath('/platform/config/storefront-domain-resolution');

  beforeAll(async () => {
    process.env.PLATFORM_STOREFRONT_DOMAIN = PLATFORM_DOMAIN;
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

  // ─── fixtures ────────────────────────────────────────────────────────────

  interface Store {
    tenantId: string;
    storeId: string;
    platformHost: string;
  }

  async function makeStore(label: string): Promise<Store> {
    const tenant = await prisma.tenant.create({
      data: { slug: `${label}-${randomUUID().slice(0, 8)}` },
    });
    const storeId = await createPrimaryStore(prisma, tenant.id);
    const platformHost = `${label}.${PLATFORM_DOMAIN}`;
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
    cache.bust();
    return { tenantId: tenant.id, storeId, platformHost };
  }

  async function addCustomDomain(
    store: Store,
    hostname: string,
    isPrimary = false,
  ): Promise<string> {
    const row = await prisma.storeDomain.create({
      data: {
        storeId: store.storeId,
        tenantId: store.tenantId,
        hostname,
        type: 'CUSTOM',
        verificationStatus: 'VERIFIED',
        tlsStatus: 'ISSUED',
        isPrimary,
      },
    });
    cache.bust();
    return row.id;
  }

  async function addCatalogue(
    store: Store,
    opts: { category: string; products: string[]; inactive?: string[] },
  ): Promise<void> {
    const category = await prisma.category.create({
      data: {
        tenantId: store.tenantId,
        storeId: store.storeId,
        name: opts.category,
        slug: `${opts.category.toLowerCase()}-${randomUUID().slice(0, 6)}`,
        isActive: true,
      },
    });
    for (const slug of opts.products) {
      await prisma.product.create({
        data: {
          tenantId: store.tenantId,
          storeId: store.storeId,
          categoryId: category.id,
          name: slug,
          slug,
          basePrice: 100,
          minQuantity: 1,
          isActive: true,
        },
      });
    }
    for (const slug of opts.inactive ?? []) {
      await prisma.product.create({
        data: {
          tenantId: store.tenantId,
          storeId: store.storeId,
          categoryId: category.id,
          name: slug,
          slug,
          basePrice: 100,
          minQuantity: 1,
          isActive: false,
        },
      });
    }
  }

  async function setHostResolution(): Promise<void> {
    const admin = await registerSuperAdmin(app, prisma);
    await http(app)
      .put(MODE_ROUTE)
      .set(...authHeader(admin))
      .send({ mode: 'host_resolution', justification: 'e2e: §12 SEO' })
      .expect(200);
  }

  // ─── A. robots.txt ───────────────────────────────────────────────────────

  describe('A. robots.txt', () => {
    beforeEach(setHostResolution);

    it('serves a store-specific body with a Sitemap: line on the canonical origin (§18.1)', async () => {
      const store = await makeStore('alpha');
      const res = await http(app)
        .get(`${ROBOTS}?host=${store.platformHost}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.headers['cache-control']).toBe('public, max-age=3600');
      expect(res.text).toContain('User-agent: *');
      expect(res.text).toContain('Allow: /');
      expect(res.text).toContain('Disallow: /admin');
      expect(res.text).toContain('Disallow: /checkout');
      expect(res.text).toContain(
        `Sitemap: http://${store.platformHost}/sitemap.xml`,
      );
      // Not wrapped in the JSON envelope.
      expect(res.text).not.toContain('"success"');
    });

    it('differs between two hosts (§19 E-5)', async () => {
      const a = await makeStore('alpha');
      const b = await makeStore('beta');
      const resA = await http(app)
        .get(`${ROBOTS}?host=${a.platformHost}`)
        .expect(200);
      const resB = await http(app)
        .get(`${ROBOTS}?host=${b.platformHost}`)
        .expect(200);
      expect(resA.text).not.toBe(resB.text);
      expect(resA.text).toContain(a.platformHost);
      expect(resA.text).not.toContain(b.platformHost);
    });

    it('accepts the S-12 x-forwarded-host fallback when no ?host= is captured', async () => {
      const store = await makeStore('alpha');
      const res = await http(app)
        .get(ROBOTS)
        .set('x-forwarded-host', store.platformHost)
        .expect(200);
      expect(res.text).toContain(
        `Sitemap: http://${store.platformHost}/`.replace(/\/$/, '/sitemap.xml'),
      );
    });

    it('accepts an Origin as the last-resort signal', async () => {
      const store = await makeStore('alpha');
      const res = await http(app)
        .get(ROBOTS)
        .set('Origin', `http://${store.platformHost}`)
        .expect(200);
      expect(res.text).toContain(store.platformHost);
    });

    it('degrades to a permissive static body on an unknown host — never a 404, never a blanket disallow', async () => {
      await makeStore('alpha');
      const res = await http(app)
        .get(`${ROBOTS}?host=does-not-exist.${PLATFORM_DOMAIN}`)
        .expect(200);
      expect(res.text).toContain('Allow: /');
      expect(res.text).not.toContain('Sitemap:');
      expect(res.text).not.toMatch(/^Disallow: \/$/m);
      // Leaks nothing about which hostnames exist.
      expect(res.text).not.toContain('alpha');
    });

    it('degrades with no signal at all (a bare crawler request)', async () => {
      await makeStore('alpha');
      const res = await http(app).get(ROBOTS).expect(200);
      expect(res.text).toContain('Allow: /');
      expect(res.text).not.toContain('Sitemap:');
    });

    it('degrades for an unserved custom domain rather than revealing it exists', async () => {
      const store = await makeStore('alpha');
      await prisma.storeDomain.create({
        data: {
          storeId: store.storeId,
          tenantId: store.tenantId,
          hostname: 'pending.example',
          type: 'CUSTOM',
          verificationStatus: 'PENDING',
          tlsStatus: 'PENDING',
        },
      });
      cache.bust();
      const res = await http(app)
        .get(`${ROBOTS}?host=pending.example`)
        .expect(200);
      expect(res.text).not.toContain('Sitemap:');
    });
  });

  // ─── B. sitemap.xml ──────────────────────────────────────────────────────

  describe('B. sitemap.xml', () => {
    beforeEach(setHostResolution);

    it("enumerates the store's own ACTIVE products and active categories", async () => {
      const store = await makeStore('alpha');
      await addCatalogue(store, {
        category: 'Mugs',
        products: ['ceramic-mug', 'travel-mug'],
        inactive: ['retired-mug'],
      });

      const res = await http(app)
        .get(`${SITEMAP}?host=${store.platformHost}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('xml');
      expect(res.headers['cache-control']).toBe('public, max-age=3600');
      const origin = `http://${store.platformHost}`;
      expect(res.text).toContain(`<loc>${origin}/</loc>`);
      expect(res.text).toContain(`<loc>${origin}/products</loc>`);
      expect(res.text).toContain(`<loc>${origin}/products/ceramic-mug</loc>`);
      expect(res.text).toContain(`<loc>${origin}/products/travel-mug</loc>`);
      expect(res.text).toContain('categoryId=');
      // An inactive product is never advertised.
      expect(res.text).not.toContain('retired-mug');
      // Legal pages stay out (§12.1 defers them to Phase 13).
      expect(res.text).not.toContain('/privacy');
      expect(res.text).not.toContain('/terms');
    });

    it('404s on an unknown host (🔎 S-11 — a crawler must not index one)', async () => {
      await makeStore('alpha');
      await http(app)
        .get(`${SITEMAP}?host=does-not-exist.${PLATFORM_DOMAIN}`)
        .expect(404);
    });

    it('404s with no signal at all', async () => {
      await makeStore('alpha');
      await http(app).get(SITEMAP).expect(404);
    });

    it('404s for an unserved custom domain, identically to an unknown host', async () => {
      const store = await makeStore('alpha');
      await prisma.storeDomain.create({
        data: {
          storeId: store.storeId,
          tenantId: store.tenantId,
          hostname: 'pending.example',
          type: 'CUSTOM',
          verificationStatus: 'VERIFIED',
          tlsStatus: 'PENDING',
        },
      });
      cache.bust();
      const unserved = await http(app)
        .get(`${SITEMAP}?host=pending.example`)
        .expect(404);
      const unknown = await http(app)
        .get(`${SITEMAP}?host=nope.example`)
        .expect(404);
      expect(unserved.body.message).toEqual(unknown.body.message);
    });
  });

  // ─── C. cross-tenant isolation ───────────────────────────────────────────

  describe('C. cross-tenant isolation', () => {
    beforeEach(setHostResolution);

    it("one store's sitemap never contains another store's catalogue", async () => {
      const a = await makeStore('alpha');
      const b = await makeStore('beta');
      await addCatalogue(a, { category: 'Mugs', products: ['alpha-mug'] });
      await addCatalogue(b, { category: 'Tees', products: ['beta-tee'] });

      const resA = await http(app)
        .get(`${SITEMAP}?host=${a.platformHost}`)
        .expect(200);
      expect(resA.text).toContain('alpha-mug');
      expect(resA.text).not.toContain('beta-tee');

      const resB = await http(app)
        .get(`${SITEMAP}?host=${b.platformHost}`)
        .expect(200);
      expect(resB.text).toContain('beta-tee');
      expect(resB.text).not.toContain('alpha-mug');
    });

    it("a forged host only ever selects that host's own public content", async () => {
      const a = await makeStore('alpha');
      const b = await makeStore('beta');
      await addCatalogue(a, { category: 'Mugs', products: ['alpha-mug'] });
      await addCatalogue(b, { category: 'Tees', products: ['beta-tee'] });

      // Asking for B while claiming an Origin of A: the captured host wins and
      // the answer is B's own public sitemap — never a mixture, never A's.
      const res = await http(app)
        .get(`${SITEMAP}?host=${b.platformHost}`)
        .set('Origin', `http://${a.platformHost}`)
        .expect(200);
      expect(res.text).toContain('beta-tee');
      expect(res.text).not.toContain('alpha-mug');
    });

    it('neither file exposes a tenant id, store id or domain-row id', async () => {
      const store = await makeStore('alpha');
      await addCatalogue(store, {
        category: 'Mugs',
        products: ['ceramic-mug'],
      });
      const robots = await http(app)
        .get(`${ROBOTS}?host=${store.platformHost}`)
        .expect(200);
      const sitemap = await http(app)
        .get(`${SITEMAP}?host=${store.platformHost}`)
        .expect(200);
      for (const body of [robots.text, sitemap.text]) {
        expect(body).not.toContain(store.tenantId);
        expect(body).not.toContain(store.storeId);
      }
    });
  });

  // ─── D. canonical host behaviour (§11) ───────────────────────────────────

  describe('D. canonical behaviour', () => {
    beforeEach(setHostResolution);

    it('301s both files from a non-primary served host to the canonical origin, path preserved', async () => {
      const store = await makeStore('alpha');
      await addCustomDomain(store, 'secondary.example');

      const robots = await http(app)
        .get(`${ROBOTS}?host=secondary.example`)
        .expect(301);
      expect(robots.headers['location']).toBe(
        `http://${store.platformHost}/robots.txt`,
      );

      const sitemap = await http(app)
        .get(`${SITEMAP}?host=secondary.example`)
        .expect(301);
      expect(sitemap.headers['location']).toBe(
        `http://${store.platformHost}/sitemap.xml`,
      );
    });

    it('does NOT redirect on the primary host — no loop', async () => {
      const store = await makeStore('alpha');
      await http(app).get(`${ROBOTS}?host=${store.platformHost}`).expect(200);
      await http(app).get(`${SITEMAP}?host=${store.platformHost}`).expect(200);
    });

    it('follows a primary change — the new primary serves, the old one 301s to it', async () => {
      const store = await makeStore('alpha');
      const customId = await addCustomDomain(store, 'shop.example');
      // Promote the custom domain, demoting the platform subdomain.
      await prisma.storeDomain.updateMany({
        where: { storeId: store.storeId, isPrimary: true },
        data: { isPrimary: false },
      });
      await prisma.storeDomain.update({
        where: { id: customId },
        data: { isPrimary: true },
      });
      cache.bust();

      await http(app).get(`${ROBOTS}?host=shop.example`).expect(200);
      const old = await http(app)
        .get(`${ROBOTS}?host=${store.platformHost}`)
        .expect(301);
      expect(old.headers['location']).toBe('http://shop.example/robots.txt');
    });
  });

  // ─── E. legacy mode (mode coupling, §15) ─────────────────────────────────

  describe('E. legacy_single_store mode', () => {
    it('serves robots.txt without host resolution, exactly as a single-store site', async () => {
      await makeStore('alpha');
      // Mode row absent => legacy (the default), no flip performed.
      const res = await http(app).get(ROBOTS).expect(200);
      expect(res.text).toContain('User-agent: *');
      expect(res.text).toContain('Disallow: /admin');
    });

    it('never 301s in legacy mode — there is no canonical origin to point at', async () => {
      const store = await makeStore('alpha');
      await addCustomDomain(store, 'secondary.example');
      await http(app).get(`${ROBOTS}?host=secondary.example`).expect(200);
    });
  });
});
