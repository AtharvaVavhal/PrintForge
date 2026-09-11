import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * W2 (Phase 5 decision P5-D3) — pins the two audit models to the exact
 * frozen field/index/nullability contract, the way `tenant-rls.e2e-spec.ts`
 * pins the RLS migration's shape and `platform.guard.spec.ts` pins
 * `PlatformGuard`'s dormancy. A schema edit that silently drops or renames
 * a frozen field, or that introduces a generic `AuditLog` model (explicitly
 * rejected by P5-D3), fails this test before it ever reaches a migration.
 */
describe('PlatformAuditLog / TenantAuditLog schema contract (P5-D3)', () => {
  const schema = readFileSync(
    join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );

  function modelBody(modelName: string): string {
    const re = new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`, 'm');
    const match = re.exec(schema);
    expect(match).not.toBeNull();
    return match![1];
  }

  describe('PlatformAuditLog', () => {
    const body = modelBody('PlatformAuditLog');

    it.each([
      ['id', /id\s+String\s+@id/],
      ['actorUserId (required)', /actorUserId\s+String(?!\?)/],
      ['action (required)', /\baction\s+String(?!\?)/],
      ['targetType (required)', /targetType\s+String(?!\?)/],
      ['targetId (required)', /targetId\s+String(?!\?)/],
      ['tenantId (nullable)', /tenantId\s+String\?/],
      ['justification (nullable)', /justification\s+String\?/],
      ['metadata (required Json)', /metadata\s+Json(?!\?)/],
      ['ip (required)', /\bip\s+String(?!\?)/],
      ['createdAt', /createdAt\s+DateTime\s+@default\(now\(\)\)/],
    ])('has field: %s', (_label, pattern) => {
      expect(body).toMatch(pattern);
    });

    it('maps to platform_audit_logs and indexes (actorUserId, createdAt) and (tenantId, createdAt)', () => {
      expect(body).toMatch(/@@map\("platform_audit_logs"\)/);
      expect(body).toMatch(/@@index\(\[actorUserId, createdAt\]\)/);
      expect(body).toMatch(/@@index\(\[tenantId, createdAt\]\)/);
    });
  });

  describe('TenantAuditLog', () => {
    const body = modelBody('TenantAuditLog');

    it.each([
      ['id', /id\s+String\s+@id/],
      ['tenantId (required)', /tenantId\s+String(?!\?)/],
      ['actorMembershipId (nullable)', /actorMembershipId\s+String\?/],
      ['actorCustomerId (nullable)', /actorCustomerId\s+String\?/],
      ['action (required)', /\baction\s+String(?!\?)/],
      ['targetType (required)', /targetType\s+String(?!\?)/],
      ['targetId (required)', /targetId\s+String(?!\?)/],
      ['metadata (required Json)', /metadata\s+Json(?!\?)/],
      [
        'viaSupportSessionId (nullable, P5-D4A)',
        /viaSupportSessionId\s+String\?/,
      ],
      ['createdAt', /createdAt\s+DateTime\s+@default\(now\(\)\)/],
    ])('has field: %s', (_label, pattern) => {
      expect(body).toMatch(pattern);
    });

    it('maps to tenant_audit_logs and indexes (tenantId, createdAt)', () => {
      expect(body).toMatch(/@@map\("tenant_audit_logs"\)/);
      expect(body).toMatch(/@@index\(\[tenantId, createdAt\]\)/);
    });

    it('viaSupportSessionId remains a plain scalar on TenantAuditLog, NOT a Prisma relation, even now that a real SupportSession model exists (Phase 5 W6)', () => {
      // Matches a field whose TYPE is `SupportSession` (a real relation),
      // e.g. `session SupportSession? @relation(...)` — deliberately does
      // NOT match `viaSupportSessionId String?`, whose type is `String`.
      // `body` is TenantAuditLog's own block (not the whole schema), so
      // this stays a meaningful check even though `model SupportSession`
      // now legitimately exists elsewhere in the file (W6's own model,
      // asserted to exist below) — W2's original design decision (a plain
      // scalar cross-reference, not an FK) was never revisited by W6; see
      // the W6 implementation report's schema section for why.
      const relationTypedAsSupportSession = /\n\s*\w+\s+SupportSession\??/;
      expect(body).not.toMatch(relationTypedAsSupportSession);
    });

    it('a real SupportSession model now exists (Phase 5 W6) — the forward reference this field was always documented as anticipating', () => {
      expect(schema).toMatch(/model SupportSession\b/);
    });
  });

  it('does NOT introduce a generic AuditLog model (P5-D3 explicitly rejects that design)', () => {
    expect(schema).not.toMatch(/model AuditLog\b/);
  });

  it('OrderStatusHistory is untouched — it remains the separate, order-specific audit trail', () => {
    expect(schema).toMatch(/model OrderStatusHistory \{/);
  });
});
