import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  apiPath,
  authHeader,
  http,
  registerUser,
  TestUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';

/**
 * SaaS Phase 2a — merchant JWT identity enrichment + thin token
 * (docs/saas/PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §C.5 / §C.9;
 * decisions P2-D4 (thin token), P2-D1 (platformRole); acceptance criteria
 * AC-P2-17, AC-P2-18, AC-P2-19). Also asserts the customer-auth surface is
 * absent (AC-P2-12′ — decision P2-D7).
 */
describe('SaaS Phase 2a — merchant identity (JwtStrategy enrichment, thin token)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let strategy: JwtStrategy;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    jwt = app.get(JwtService, { strict: false });
    strategy = app.get(JwtStrategy);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  // ── AC-P2-17 — validate() loads platformRole + ACTIVE memberships ─────────

  it('AC-P2-17: validate() returns platformRole=null and memberships=[] for a plain user', async () => {
    const u = await prisma.user.create({
      data: { email: `u-${randomUUID()}@example.test`, passwordHash: 'x' },
    });
    const result = await strategy.validate({
      sub: u.id,
      tokenVersion: u.tokenVersion,
    });
    expect(result).toEqual({
      id: u.id,
      email: u.email,
      role: 'CUSTOMER',
      platformRole: null,
      memberships: [],
    });
  });

  it('AC-P2-17: validate() loads platformRole=SUPER_ADMIN as an identity fact', async () => {
    const u = await prisma.user.create({
      data: {
        email: `sa-${randomUUID()}@example.test`,
        passwordHash: 'x',
        platformRole: 'SUPER_ADMIN',
      },
    });
    const result = await strategy.validate({
      sub: u.id,
      tokenVersion: u.tokenVersion,
    });
    expect(result.platformRole).toBe('SUPER_ADMIN');
    expect(result.memberships).toEqual([]);
  });

  it('AC-P2-17: validate() loads only ACTIVE memberships, as {tenantId, role} facts (no active-tenant derivation)', async () => {
    const u = await prisma.user.create({
      data: { email: `m-${randomUUID()}@example.test`, passwordHash: 'x' },
    });
    const tA = await prisma.tenant.create({
      data: { slug: `t-${randomUUID()}` },
    });
    const tB = await prisma.tenant.create({
      data: { slug: `t-${randomUUID()}` },
    });
    const tC = await prisma.tenant.create({
      data: { slug: `t-${randomUUID()}` },
    });
    await prisma.tenantMembership.create({
      data: { userId: u.id, tenantId: tA.id, role: 'OWNER', status: 'ACTIVE' },
    });
    await prisma.tenantMembership.create({
      data: { userId: u.id, tenantId: tB.id, role: 'VIEWER', status: 'ACTIVE' },
    });
    await prisma.tenantMembership.create({
      data: { userId: u.id, tenantId: tC.id, role: 'ADMIN', status: 'INVITED' },
    });

    const result = await strategy.validate({
      sub: u.id,
      tokenVersion: u.tokenVersion,
    });
    expect(result.memberships).toHaveLength(2);
    expect(result.memberships).toEqual(
      expect.arrayContaining([
        { tenantId: tA.id, role: 'OWNER' },
        { tenantId: tB.id, role: 'VIEWER' },
      ]),
    );
    // the INVITED membership is NOT included
    expect(
      result.memberships.find((m) => m.tenantId === tC.id),
    ).toBeUndefined();
  });

  it('validate() still rejects a stale tokenVersion and an inactive user (§23 unchanged)', async () => {
    const u = await prisma.user.create({
      data: { email: `s-${randomUUID()}@example.test`, passwordHash: 'x' },
    });
    await expect(
      strategy.validate({ sub: u.id, tokenVersion: u.tokenVersion + 1 }),
    ).rejects.toThrow();

    await prisma.user.update({
      where: { id: u.id },
      data: { isActive: false },
    });
    await expect(
      strategy.validate({ sub: u.id, tokenVersion: u.tokenVersion }),
    ).rejects.toThrow();
  });

  // ── AC-P2-18 — old fat payload still authorizes ─────────────────────────

  it('AC-P2-18: a pre-Phase-2a fat token { sub, email, role, tokenVersion } still authorizes', async () => {
    const user = await registerUser(app, 'compat');
    const oldToken = jwt.sign({
      sub: user.id,
      email: user.email,
      role: 'CUSTOMER',
      tokenVersion: 0,
    });
    await http(app)
      .get(apiPath('/users/me'))
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(200);
  });

  it('AC-P2-18: a thin token { sub, tokenVersion } authorizes identically', async () => {
    const user = await registerUser(app, 'thin');
    const thinToken = jwt.sign({ sub: user.id, tokenVersion: 0 });
    await http(app)
      .get(apiPath('/users/me'))
      .set('Authorization', `Bearer ${thinToken}`)
      .expect(200);
  });

  // ── thin token: newly-issued tokens carry no email/role ─────────────────

  it('a newly-issued access token is thin — payload is { sub, tokenVersion } only (+ iat/exp)', async () => {
    const user = await registerUser(app, 'shape');
    // decode the JWT payload segment directly — a clean typed object, no `any`
    const decoded = JSON.parse(
      Buffer.from(user.accessToken.split('.')[1], 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(Object.keys(decoded).sort()).toEqual([
      'exp',
      'iat',
      'sub',
      'tokenVersion',
    ]);
    expect(decoded.sub).toBe(user.id);
    expect(decoded.tokenVersion).toBe(0);
    expect(decoded).not.toHaveProperty('email');
    expect(decoded).not.toHaveProperty('role');
  });

  // ── AC-P2-19 — tokenVersion not bumped by Phase 2a ─────────────────────

  it('AC-P2-19: register + login + a normal request never bump tokenVersion', async () => {
    const email = `tv-${randomUUID()}@example.test`;
    const reg = await http(app)
      .post(apiPath('/auth/register'))
      .send({ email, password: 'CorrectHorseBattery9!' })
      .expect(201);
    const id = reg.body.data.user.id as string;
    expect(
      (await prisma.user.findUnique({ where: { id } }))?.tokenVersion,
    ).toBe(0);

    await http(app)
      .post(apiPath('/auth/login'))
      .send({ email, password: 'CorrectHorseBattery9!' })
      .expect(200);
    const token = reg.body.data.accessToken as string;
    await http(app)
      .get(apiPath('/users/me'))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(
      (await prisma.user.findUnique({ where: { id } }))?.tokenVersion,
    ).toBe(0);
  });

  // ── AC-P2-12′ — no customer-auth surface exists ────────────────────────

  it('AC-P2-12′: there is no /storefront/auth/* surface', async () => {
    for (const path of [
      '/storefront/auth/register',
      '/storefront/auth/login',
      '/storefront/auth/refresh',
    ]) {
      const res = await http(app).post(apiPath(path)).send({});
      expect(res.status).toBe(404);
    }
  });

  it('admin RBAC still denies — a normal user with no TenantMembership cannot reach /admin/* (Phase 3: PermissionsGuard, not RolesGuard/PlatformGuard)', async () => {
    const user: TestUser = await registerUser(app, 'rbac');
    await http(app)
      .get(apiPath('/admin/dashboard'))
      .set(...authHeader(user))
      .expect(403);
  });
});
