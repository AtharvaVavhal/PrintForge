import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import { apiPath, http } from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';

/**
 * §30 — two distinct health signals, kept as two endpoints on purpose
 * (health.controller.ts): GET /health is process-liveness only (no
 * PrismaService dependency), GET /health/deep additionally runs a real
 * `SELECT 1` to reflect DB reachability. Only the DB-up case is covered
 * for /health/deep — deliberately simulating a DB outage against the
 * shared e2e connection pool would risk every other file's tests, not
 * something this suite should do.
 */
describe('Health endpoints (§30)', () => {
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

  describe('GET /health — process liveness only', () => {
    it('returns 200 with status ok', async () => {
      const res = await http(app).get(apiPath('/health')).expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(typeof res.body.data.timestamp).toBe('string');
      expect(new Date(res.body.data.timestamp as string).toString()).not.toBe(
        'Invalid Date',
      );
    });

    it('is unauthenticated — no Authorization header required', async () => {
      await http(app).get(apiPath('/health')).expect(200);
    });
  });

  describe('GET /health/deep — process liveness + DB connectivity', () => {
    it('returns 200 with status ok when the database is reachable', async () => {
      const res = await http(app).get(apiPath('/health/deep')).expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(typeof res.body.data.timestamp).toBe('string');
      expect(new Date(res.body.data.timestamp as string).toString()).not.toBe(
        'Invalid Date',
      );
    });

    it('is unauthenticated — no Authorization header required', async () => {
      await http(app).get(apiPath('/health/deep')).expect(200);
    });

    it('never leaks database connection details or credentials in the response', async () => {
      const res = await http(app).get(apiPath('/health/deep')).expect(200);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/postgres(ql)?:\/\//i);
      expect(raw.toLowerCase()).not.toContain('password');
    });
  });
});
