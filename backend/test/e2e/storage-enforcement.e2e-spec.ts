import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import { apiPath, authHeader, http, registerAdmin } from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { LimitEnforcementService } from '../../src/limits/limit-enforcement.service';

/**
 * Phase 6 W5 / P6-D4 — `storage_mb` enforcement at the REAL upload
 * boundary: real HTTP `POST /uploads`, real Postgres, real guard chain,
 * real `LimitEnforcementService`/`UsageService`. The ONE stubbed piece is
 * the external Cloudinary network call — replaced by `FakeCloudinaryService`
 * (`test-app.ts`'s existing `overrideProvider`, the SAME mechanism every
 * other upload e2e test in this repo already uses, e.g.
 * `upload-magic-bytes.e2e-spec.ts`). Crucially, `FakeCloudinaryService
 * .uploadBuffer` reports `bytes: buffer.length` — the REAL length of
 * whatever buffer is actually uploaded — so this suite drives exact MiB
 * boundary conditions by controlling the real byte size of a real
 * multipart upload, not by fabricating a number. This is real for
 * everything the storage_mb decision (P6-D4) and the transaction/CAS
 * mechanism actually need to prove; only the external network round-trip
 * to Cloudinary itself is stubbed, exactly as documented here.
 */
describe('Phase 6 W5 / P6-D4 — storage_mb enforcement (real Postgres, real /uploads boundary)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  const PNG_HEADER = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  /** A real, valid PNG-signature-prefixed buffer of an EXACT total byte
   * length — `detectFileSignature` only inspects the first 8 bytes, so
   * padding with arbitrary bytes after the header is a genuine file of
   * that exact size, not a fabricated number. */
  function pngBufferOfSize(totalBytes: number): Buffer {
    if (totalBytes < PNG_HEADER.length) {
      return PNG_HEADER.subarray(0, totalBytes);
    }
    return Buffer.concat([
      PNG_HEADER,
      Buffer.alloc(totalBytes - PNG_HEADER.length),
    ]);
  }

  async function makePlanWithStorageLimit(limitValue: number | null) {
    const plan = await prisma.plan.create({
      data: {
        key: `plan-${randomUUID().slice(0, 8)}`,
        name: 'Test Plan',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    await prisma.planLimit.create({
      data: {
        planId: plan.id,
        limitKey: 'storage_mb',
        limitValue,
        period: 'PERSISTENT',
      },
    });
    return plan;
  }

  async function attachSubscription(tenantId: string, planId: string) {
    await prisma.subscription.create({
      data: { tenantId, planId, status: 'ACTIVE' },
    });
  }

  async function usageMiB(tenantId: string) {
    const row = await prisma.usage.findUnique({
      where: {
        tenantId_limitKey_period: {
          tenantId,
          limitKey: 'storage_mb',
          period: 'persistent',
        },
      },
    });
    return row?.count ?? 0;
  }

  // ─── Exact bytes → MiB boundary, driven by a real upload's real size ────

  it('a small (100-byte) real upload reserves exactly 1 MiB (ceil) — no file this small can carry a valid signature, so the smallest signature-detectable file (>= 8 bytes) stands in for "any sub-1-MiB file"', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithStorageLimit(10);
    await attachSubscription(admin.tenantId, plan.id);

    await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(admin))
      .attach('file', pngBufferOfSize(100), {
        filename: 'a.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(await usageMiB(admin.tenantId)).toBe(1);
  });

  it('a real upload of exactly 1 MiB (1,048,576 bytes) reserves exactly 1 MiB, never 2', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithStorageLimit(10);
    await attachSubscription(admin.tenantId, plan.id);

    await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(admin))
      .attach('file', pngBufferOfSize(1_048_576), {
        filename: 'a.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(await usageMiB(admin.tenantId)).toBe(1);
  });

  it('a real upload of 1 MiB + 1 byte reserves 2 MiB (ceil rounds up on any remainder)', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithStorageLimit(10);
    await attachSubscription(admin.tenantId, plan.id);

    await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(admin))
      .attach('file', pngBufferOfSize(1_048_577), {
        filename: 'a.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(await usageMiB(admin.tenantId)).toBe(2);
  });

  // ─── Enforcement: under / exhausted / missing ───────────────────────────

  it('an upload that would exceed the limit is denied (403 limit_exceeded), no UploadedFile row created', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithStorageLimit(1); // 1 MiB total
    await attachSubscription(admin.tenantId, plan.id);

    // First upload consumes the entire 1 MiB budget.
    await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(admin))
      .attach('file', pngBufferOfSize(1_048_576), {
        filename: 'a.png',
        contentType: 'image/png',
      })
      .expect(201);

    const res = await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(admin))
      .attach('file', pngBufferOfSize(100), {
        filename: 'b.png',
        contentType: 'image/png',
      })
      .expect(403);
    expect(res.body.error.message).toBe('limit_exceeded');

    const files = await prisma.uploadedFile.count({
      where: { tenantId: admin.tenantId },
    });
    expect(files).toBe(1); // the denied attempt created nothing
    expect(await usageMiB(admin.tenantId)).toBe(1); // unchanged
  });

  it('a missing storage_mb PlanLimit row denies every upload (deny-by-default, P6-D2)', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await prisma.plan.create({
      data: {
        key: `plan-${randomUUID().slice(0, 8)}`,
        name: 'Bare Plan',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    await attachSubscription(admin.tenantId, plan.id);

    const res = await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(admin))
      .attach('file', pngBufferOfSize(100), {
        filename: 'a.png',
        contentType: 'image/png',
      })
      .expect(403);
    expect(res.body.error.message).toBe('limit_exceeded');
  });

  it('unlimited storage (limitValue: NULL) allows a large real upload and still tracks usage', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithStorageLimit(null);
    await attachSubscription(admin.tenantId, plan.id);

    await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(admin))
      .attach('file', pngBufferOfSize(5_000_000), {
        filename: 'a.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(await usageMiB(admin.tenantId)).toBe(
      Math.ceil(5_000_000 / 1_048_576),
    );
  });

  // ─── Cross-tenant isolation ───────────────────────────────────────────────

  it('two tenants with independent storage limits never interfere with each other', async () => {
    const adminA = await registerAdmin(app, prisma);
    const adminB = await registerAdmin(app, prisma);
    const planA = await makePlanWithStorageLimit(1);
    const planB = await makePlanWithStorageLimit(10);
    await attachSubscription(adminA.tenantId, planA.id);
    await attachSubscription(adminB.tenantId, planB.id);

    await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(adminA))
      .attach('file', pngBufferOfSize(1_048_576), {
        filename: 'a.png',
        contentType: 'image/png',
      })
      .expect(201);
    // A is now exhausted — must deny regardless of B's own room.
    await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(adminA))
      .attach('file', pngBufferOfSize(100), {
        filename: 'a2.png',
        contentType: 'image/png',
      })
      .expect(403);

    await http(app)
      .post(apiPath('/uploads'))
      .set(...authHeader(adminB))
      .attach('file', pngBufferOfSize(1_048_576), {
        filename: 'b.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(await usageMiB(adminA.tenantId)).toBe(1);
    expect(await usageMiB(adminB.tenantId)).toBe(1);
  });

  // ─── Rollback (same shared mechanism as products/team_members) ─────────
  //
  // `UploadedFile.cloudinaryPublicId` is genuinely globally unique, but
  // `FakeCloudinaryService` always generates a fresh random UUID for it —
  // there is no way to force a real collision deterministically through
  // the actual HTTP path (unlike a contrived scenario, this reflects a
  // real property of the fake, not a limitation worth working around by
  // modifying it). The rollback guarantee itself is NOT storage_mb-specific
  // code — `UploadsService.create` composes the exact same shared
  // `LimitEnforcementService.assertLimit` + caller-owned `$transaction`
  // pattern already proven for `products`/`team_members`
  // (`limit-enforcement.e2e-spec.ts` §7) and generically for `UsageService`
  // itself (`usage-engine.e2e-spec.ts`). This test proves the same real
  // Postgres guarantee holds for the `storage_mb` key specifically, via
  // the real, DI-resolved `LimitEnforcementService` — real Postgres, the
  // real production service, no mocks, same convention as those two prior
  // proofs.
  it('a storage_mb reservation that succeeds, followed by a same-transaction failure, rolls back — usage returns to its prior value', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithStorageLimit(10);
    await attachSubscription(admin.tenantId, plan.id);
    const limitEnforcementService = app.get(LimitEnforcementService);

    await expect(
      prisma.$transaction(async (tx) => {
        await limitEnforcementService.assertLimit(
          tx,
          admin.tenantId,
          'storage_mb',
          3,
        );
        throw new Error('simulated downstream failure after reservation');
      }),
    ).rejects.toThrow('simulated downstream failure after reservation');

    expect(await usageMiB(admin.tenantId)).toBe(0);
  });
});
