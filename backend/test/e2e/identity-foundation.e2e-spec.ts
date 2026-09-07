import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { resetDatabase } from './support/db';

/**
 * SaaS Master Plan Phase 2a — identity foundation
 * (docs/saas/PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §C; DECISIONS.md v1.2
 * decisions P2-D1/P2-D2/P2-D11/P2-D12; acceptance criteria AC-P2-01, AC-P2-03,
 * AC-P2-04, AC-P2-26).
 *
 * Pure schema-constraint tests — a bare PrismaClient against the isolated
 * printforge_test database (Phase 2a adds no HTTP surface for these; customer
 * auth is Phase 9/12 per decision P2-D7). Proves the DB itself enforces the
 * store-scoped identity invariants (frozen SaaS invariant 3).
 */
describe('SaaS Phase 2a — identity foundation (PlatformRole + Customer)', () => {
  const prisma = new PrismaClient();

  async function makeTenant(): Promise<string> {
    const t = await prisma.tenant.create({
      data: { slug: `t-${randomUUID()}` },
    });
    return t.id;
  }
  async function makeStore(tenantId: string): Promise<string> {
    const s = await prisma.store.create({
      data: { tenantId, slug: `s-${randomUUID()}`, name: 'Test Store' },
    });
    return s.id;
  }
  async function makeStoreAndTenant(): Promise<{
    tenantId: string;
    storeId: string;
  }> {
    const tenantId = await makeTenant();
    const storeId = await makeStore(tenantId);
    return { tenantId, storeId };
  }

  beforeEach(async () => {
    await resetDatabase(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── PlatformRole enum + User.platformRole ────────────────────────────────

  it('AC-P2-03: PlatformRole has exactly one value, SUPER_ADMIN', async () => {
    const rows = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
      `SELECT e.enumlabel
         FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'PlatformRole'
        ORDER BY e.enumsortorder`,
    );
    expect(rows.map((r) => r.enumlabel)).toEqual(['SUPER_ADMIN']);
  });

  it('AC-P2-04: User.platformRole defaults to NULL (no default) and accepts NULL', async () => {
    const u = await prisma.user.create({
      data: { email: `u-${randomUUID()}@example.test`, passwordHash: 'x' },
    });
    expect(u.platformRole).toBeNull();
  });

  it('AC-P2-04: User.platformRole persists SUPER_ADMIN when explicitly set', async () => {
    const u = await prisma.user.create({
      data: {
        email: `sa-${randomUUID()}@example.test`,
        passwordHash: 'x',
        platformRole: 'SUPER_ADMIN',
      },
    });
    expect(u.platformRole).toBe('SUPER_ADMIN');
    const reread = await prisma.user.findUnique({ where: { id: u.id } });
    expect(reread?.platformRole).toBe('SUPER_ADMIN');
  });

  it('AC-P2-04: platformRole is a nullable column at the DB level (information_schema)', async () => {
    const rows = await prisma.$queryRawUnsafe<
      { is_nullable: string; column_default: string | null }[]
    >(
      `SELECT is_nullable, column_default
         FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'platformRole'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('YES');
    expect(rows[0].column_default).toBeNull();
  });

  it('AC-P2-05: the legacy Role enum is unchanged { CUSTOMER, ADMIN }', async () => {
    const rows = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'Role' ORDER BY e.enumsortorder`,
    );
    expect(rows.map((r) => r.enumlabel)).toEqual(['CUSTOMER', 'ADMIN']);
  });

  // ── Customer model ──────────────────────────────────────────────────────

  it('AC-P2-01: a Customer belongs to a Store and a Tenant, with lifecycle defaults', async () => {
    const { tenantId, storeId } = await makeStoreAndTenant();
    const c = await prisma.customer.create({
      data: {
        storeId,
        tenantId,
        email: `c-${randomUUID()}@example.test`,
        passwordHash: 'x',
      },
    });
    expect(c.isActive).toBe(true);
    expect(c.tokenVersion).toBe(0);
    expect(c.failedLoginAttempts).toBe(0);
    expect(c.passwordResetTokenHash).toBeNull();
  });

  it('Customer.storeId FK rejects a non-existent store', async () => {
    const tenantId = await makeTenant();
    await expect(
      prisma.customer.create({
        data: {
          storeId: randomUUID(),
          tenantId,
          email: 'x@example.test',
          passwordHash: 'x',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('Customer.tenantId FK rejects a non-existent tenant', async () => {
    const tenantId = await makeTenant();
    const storeId = await makeStore(tenantId);
    await expect(
      prisma.customer.create({
        data: {
          storeId,
          tenantId: randomUUID(),
          email: 'x@example.test',
          passwordHash: 'x',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('Customer FK is RESTRICT — a Store / Tenant with a Customer cannot be hard-deleted', async () => {
    const { tenantId, storeId } = await makeStoreAndTenant();
    await prisma.customer.create({
      data: {
        storeId,
        tenantId,
        email: `c-${randomUUID()}@example.test`,
        passwordHash: 'x',
      },
    });
    await expect(
      prisma.store.delete({ where: { id: storeId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.tenant.delete({ where: { id: tenantId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('@@unique([storeId, email]): a duplicate email in the SAME store is rejected', async () => {
    const { tenantId, storeId } = await makeStoreAndTenant();
    const email = `dup-${randomUUID()}@example.test`;
    await prisma.customer.create({
      data: { storeId, tenantId, email, passwordHash: 'x' },
    });
    await expect(
      prisma.customer.create({
        data: { storeId, tenantId, email, passwordHash: 'y' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('@@unique([storeId, email]): the SAME email in TWO different stores is allowed (store-scoped identity)', async () => {
    const a = await makeStoreAndTenant();
    const b = await makeStoreAndTenant();
    const email = `shared-${randomUUID()}@example.test`;
    const c1 = await prisma.customer.create({
      data: {
        storeId: a.storeId,
        tenantId: a.tenantId,
        email,
        passwordHash: 'x',
      },
    });
    const c2 = await prisma.customer.create({
      data: {
        storeId: b.storeId,
        tenantId: b.tenantId,
        email,
        passwordHash: 'x',
      },
    });
    expect(c1.id).not.toBe(c2.id);
    expect(c1.email).toBe(c2.email);
  });

  it('Customer.email is NOT globally unique', async () => {
    // (covered by the previous test; asserted explicitly against the schema)
    const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'customers'`,
    );
    const defs = rows.map((r) => r.indexdef).join('\n');
    expect(defs).toMatch(/UNIQUE INDEX "customers_storeId_email_key"/);
    expect(defs).not.toMatch(/UNIQUE INDEX "customers_email_key"/);
  });

  it('AC-P2-11: isActive lifecycle — false is stored and re-read', async () => {
    const { tenantId, storeId } = await makeStoreAndTenant();
    const c = await prisma.customer.create({
      data: {
        storeId,
        tenantId,
        email: `c-${randomUUID()}@example.test`,
        passwordHash: 'x',
        isActive: false,
      },
    });
    const reread = await prisma.customer.findUnique({ where: { id: c.id } });
    expect(reread?.isActive).toBe(false);
  });

  it('AC-P2-11: there is NO CustomerStatus enum', async () => {
    const rows = await prisma.$queryRawUnsafe<{ typname: string }[]>(
      `SELECT typname FROM pg_type WHERE typname = 'CustomerStatus'`,
    );
    expect(rows).toHaveLength(0);
  });

  it('AC-P2-26: a Customer has NO relation to User or TenantMembership (no FK path)', async () => {
    const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'customers' ORDER BY column_name`,
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).not.toContain('userId');
    expect(cols).not.toContain('membershipId');
    expect(cols).not.toContain('tenantMembershipId');
    // the full approved column set (Master Plan §8; spec §C.3)
    expect(cols.sort()).toEqual(
      [
        'addressLine1',
        'addressLine2',
        'city',
        'country',
        'createdAt',
        'email',
        'failedLoginAttempts',
        'id',
        'isActive',
        'passwordHash',
        'passwordResetExpiresAt',
        'passwordResetTokenHash',
        'phone',
        'postalCode',
        'state',
        'storeId',
        'tenantId',
        'tokenVersion',
        'updatedAt',
      ].sort(),
    );
  });

  it('AC-P2-02: there is NO customer_refresh_tokens table (deferred to Phase 9/12)', async () => {
    const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_name = 'customer_refresh_tokens'`,
    );
    expect(rows).toHaveLength(0);
  });

  it('AC-P2-06: no existing commerce table gained a customerId column in Phase 2a', async () => {
    const rows = await prisma.$queryRawUnsafe<
      { table_name: string; column_name: string }[]
    >(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE column_name ILIKE '%customerId%'`,
    );
    // no table should reference a customer at all in Phase 2a (that is Phase 4)
    expect(rows).toEqual([]);
  });
});
