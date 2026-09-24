jest.mock('@sentry/node');
import * as Sentry from '@sentry/node';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/common/database/prisma.service';
import {
  STOREFRONT_RESOLUTION_MODE_CHANGED_ACTION,
  STOREFRONT_RESOLUTION_MODE_KEY,
} from '../../src/platform/platform-config/storefront-resolution-mode.constants';
import { StorefrontResolutionModeService } from '../../src/platform/platform-config/storefront-resolution-mode.service';
import { resetDatabase } from './support/db';
import {
  apiPath,
  authHeader,
  http,
  registerAdmin,
  registerSuperAdmin,
  registerUser,
} from './support/fixtures';
import { createTestApp } from './support/test-app';

const captureMessage = Sentry.captureMessage as jest.Mock;
const ROUTE = apiPath('/platform/config/storefront-domain-resolution');

/**
 * Phase 9 W2 — spec §14.3 (`storefront-resolution-mode.e2e-spec.ts`):
 * the P9-D8 kill-switch through the real routes, real guards and real
 * Postgres. `@sentry/node` is automocked exactly as the unit specs do, so
 * the P9-S14 "Sentry event captured (test double)" assertion is a real
 * call-count check on the same module the service imports.
 *
 * The service keeps a per-process last-known-valid mode by design (P9-S14
 * point 4), so test ORDER inside a `describe` is meaningful: the "no
 * cached mode → 503" case runs against a FRESH app before any valid read
 * has happened. `resetDatabase` truncates `platform_config` between tests
 * (support/db.ts); the in-process cache is busted explicitly where a test
 * needs a re-read without waiting for the 10 s TTL.
 */
describe('Phase 9 W2 — storefront domain-resolution kill-switch (P9-D8 / P9-S14)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let modeService: StorefrontResolutionModeService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    modeService = app.get(StorefrontResolutionModeService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    captureMessage.mockClear();
    modeService.bust();
  });

  async function setRowDirectly(value: string): Promise<void> {
    // The ONLY way an invalid value can reach the row (spec §14.3): a direct
    // database write, bypassing the DTO's 400 gate.
    await prisma.platformConfig.upsert({
      where: { key: STOREFRONT_RESOLUTION_MODE_KEY },
      create: { key: STOREFRONT_RESOLUTION_MODE_KEY, value },
      update: { value },
    });
    modeService.bust();
  }

  describe('P9-S14 fail-closed on a FRESH process (no last-known valid mode yet)', () => {
    // First test in the file: nothing valid has been read by this process.
    it('invalid stored value + no cached mode → 503, error envelope, Sentry captured — NOT legacy', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await setRowDirectly('legacy');

      const res = await http(app)
        .get(ROUTE)
        .set(...authHeader(superAdmin))
        .expect(503);
      expect(res.body).toMatchObject({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE' },
      });
      expect(JSON.stringify(res.body)).not.toContain('legacy_single_store');
      expect(captureMessage).toHaveBeenCalledTimes(1);
      expect(captureMessage.mock.calls[0][1]).toMatchObject({
        level: 'error',
        tags: { kind: 'invalid_value', key: STOREFRONT_RESOLUTION_MODE_KEY },
        extra: { rawValue: 'legacy', lastKnownValidMode: null },
      });
    });
  });

  describe('read path', () => {
    it('absent row → legacy_single_store, source "default"', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const res = await http(app)
        .get(ROUTE)
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(res.body.data).toEqual({
        mode: 'legacy_single_store',
        source: 'default',
      });
      expect(captureMessage).not.toHaveBeenCalled();
    });

    it('valid stored legacy_single_store → that mode, source "row"', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await setRowDirectly('legacy_single_store');
      const res = await http(app)
        .get(ROUTE)
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(res.body.data).toEqual({
        mode: 'legacy_single_store',
        source: 'row',
      });
    });

    it('valid stored host_resolution → that mode, source "row"', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await setRowDirectly('host_resolution');
      const res = await http(app)
        .get(ROUTE)
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(res.body.data).toEqual({ mode: 'host_resolution', source: 'row' });
    });
  });

  describe('kill-switch write path (runtime, no redeploy)', () => {
    it('PUT host_resolution → next read reflects it in the SAME process without restart, and a PlatformAuditLog row is written', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .get(ROUTE)
        .set(...authHeader(superAdmin))
        .expect(200); // primes the cache with the default

      const put = await http(app)
        .put(ROUTE)
        .set(...authHeader(superAdmin))
        .send({ mode: 'host_resolution', justification: 'W8 cutover' })
        .expect(200);
      expect(put.body.data).toEqual({ mode: 'host_resolution', source: 'row' });

      // No TTL wait: the write busts the cache in-process.
      const get = await http(app)
        .get(ROUTE)
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(get.body.data).toEqual({ mode: 'host_resolution', source: 'row' });

      const row = await prisma.platformConfig.findUniqueOrThrow({
        where: { key: STOREFRONT_RESOLUTION_MODE_KEY },
      });
      expect(row.value).toBe('host_resolution');
      expect(row.updatedByUserId).toBe(superAdmin.id);

      const audit = await prisma.platformAuditLog.findMany({
        where: { action: STOREFRONT_RESOLUTION_MODE_CHANGED_ACTION },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorUserId: superAdmin.id,
        targetType: 'PlatformConfig',
        targetId: STOREFRONT_RESOLUTION_MODE_KEY,
        tenantId: null,
        justification: 'W8 cutover',
        metadata: { from: null, to: 'host_resolution' },
      });
    });

    it('PUT back to legacy_single_store restores legacy; every write produces its own audit row with the prior value as `from`', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .put(ROUTE)
        .set(...authHeader(superAdmin))
        .send({ mode: 'host_resolution', justification: 'flip' })
        .expect(200);
      await http(app)
        .put(ROUTE)
        .set(...authHeader(superAdmin))
        .send({ mode: 'legacy_single_store', justification: 'rollback' })
        .expect(200);

      const get = await http(app)
        .get(ROUTE)
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(get.body.data).toEqual({
        mode: 'legacy_single_store',
        source: 'row',
      });

      const audit = await prisma.platformAuditLog.findMany({
        where: { action: STOREFRONT_RESOLUTION_MODE_CHANGED_ACTION },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((a) => a.metadata)).toEqual([
        { from: null, to: 'host_resolution' },
        { from: 'host_resolution', to: 'legacy_single_store' },
      ]);
    });

    it('the write route rejects an invalid mode with 400 and writes nothing', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      for (const mode of ['legacy', '', 'HOST_RESOLUTION', 'both']) {
        await http(app)
          .put(ROUTE)
          .set(...authHeader(superAdmin))
          .send({ mode, justification: 'bad' })
          .expect(400);
      }
      expect(
        await prisma.platformConfig.count({
          where: { key: STOREFRONT_RESOLUTION_MODE_KEY },
        }),
      ).toBe(0);
      expect(await prisma.platformAuditLog.count()).toBe(0);
    });

    it('justification is required (400) — a bare, unexplained flip is not accepted', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .put(ROUTE)
        .set(...authHeader(superAdmin))
        .send({ mode: 'host_resolution' })
        .expect(400);
      await http(app)
        .put(ROUTE)
        .set(...authHeader(superAdmin))
        .send({ mode: 'host_resolution', justification: '' })
        .expect(400);
    });
  });

  describe('P9-S14 fail-closed with a last-known valid mode', () => {
    it('invalid stored value + valid cached mode → the cached valid mode is served (source "last_known_valid"), Sentry captured, invalid value never surfaces', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await setRowDirectly('host_resolution');
      await http(app)
        .get(ROUTE)
        .set(...authHeader(superAdmin))
        .expect(200); // last-known valid = host_resolution

      await setRowDirectly('garbage');
      const res = await http(app)
        .get(ROUTE)
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(res.body.data).toEqual({
        mode: 'host_resolution',
        source: 'last_known_valid',
      });
      expect(captureMessage).toHaveBeenCalledTimes(1);
      expect(captureMessage.mock.calls[0][1]).toMatchObject({
        tags: { kind: 'invalid_value' },
        extra: { rawValue: 'garbage', lastKnownValidMode: 'host_resolution' },
      });
    });

    it('the invalid value never becomes the cached mode: an operator PUT repairs it and the next read is the repaired row', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await setRowDirectly('garbage');
      // degraded (served from last-known valid of the previous test's
      // process state, or 503 — either way, NOT 'garbage')
      const degraded = await http(app)
        .get(ROUTE)
        .set(...authHeader(superAdmin));
      expect([200, 503]).toContain(degraded.status);
      expect(JSON.stringify(degraded.body)).not.toContain('garbage');

      await http(app)
        .put(ROUTE)
        .set(...authHeader(superAdmin))
        .send({ mode: 'legacy_single_store', justification: 'repair' })
        .expect(200);

      const fixed = await http(app)
        .get(ROUTE)
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(fixed.body.data).toEqual({
        mode: 'legacy_single_store',
        source: 'row',
      });
      const audit = await prisma.platformAuditLog.findFirstOrThrow({
        where: { action: STOREFRONT_RESOLUTION_MODE_CHANGED_ACTION },
      });
      expect(audit.metadata).toEqual({
        from: 'garbage',
        to: 'legacy_single_store',
      });
    });
  });

  describe('authorization boundary — SUPER_ADMIN only (PlatformGuard)', () => {
    it('unauthenticated → 401 on both routes', async () => {
      await http(app).get(ROUTE).expect(401);
      await http(app)
        .put(ROUTE)
        .send({ mode: 'host_resolution', justification: 'x' })
        .expect(401);
    });

    it('a plain user → 403 on both routes', async () => {
      const user = await registerUser(app);
      await http(app)
        .get(ROUTE)
        .set(...authHeader(user))
        .expect(403);
      await http(app)
        .put(ROUTE)
        .set(...authHeader(user))
        .send({ mode: 'host_resolution', justification: 'x' })
        .expect(403);
    });

    it('a tenant OWNER (merchant admin) → 403 on both routes — tenant authority is not platform authority', async () => {
      const owner = await registerAdmin(app, prisma);
      await http(app)
        .get(ROUTE)
        .set(...authHeader(owner))
        .expect(403);
      await http(app)
        .put(ROUTE)
        .set(...authHeader(owner))
        .send({ mode: 'host_resolution', justification: 'x' })
        .expect(403);
      expect(
        await prisma.platformConfig.count({
          where: { key: STOREFRONT_RESOLUTION_MODE_KEY },
        }),
      ).toBe(0);
    });
  });
});
