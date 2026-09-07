import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Phase 3 — tenant-data-access CI guard (SaaS Master Plan §9 "CI gate: no
 * domain service imports `PrismaService` directly outside the allowlist";
 * `PHASE-3-START-GATE-AND-IMPLEMENTATION-SPEC.md` §10, §14; independent
 * audit P1 finding, closed here).
 *
 * D4 (docs/saas/DECISIONS.md, resolved 2026-09-07) makes the tenant-scoped
 * Prisma client (`common/tenant/tenant-prisma.ts`) the PRIMARY isolation
 * mechanism for the six Phase 1/2a tenancy tables (`tenants`, `stores`,
 * `store_domains`, `tenant_memberships`, `subscriptions`, `customers`).
 * This guard enforces that boundary mechanically: no file under `src/`,
 * outside a small, explicitly named allowlist, may read or write one of
 * those six models directly through the raw `PrismaService` (bypassing the
 * scoped client entirely).
 *
 * Scope note (why this does NOT scan for "any `PrismaService` import" —
 * that would fail almost the entire codebase and weaken nothing, since no
 * commerce table carries a `tenantId` column yet — Phase 4's backfill; see
 * `PHASE-3-IMPLEMENTATION-REPORT.md` §6/§11). Every commerce-domain service
 * (`orders`, `payments`, `checkout`, `cart`, …) correctly and necessarily
 * still uses the raw `PrismaService` for its OWN (non-tenancy) tables today
 * — that is unrelated to this guard, which targets only the six named
 * tenancy models specifically. Extending the guard to a business-table
 * scope is Phase 4's own concern once those tables gain `tenantId`.
 *
 * Detection heuristic (matches this codebase's one consistent convention —
 * verified: every `PrismaService` injection site in `src/` uses the
 * property/parameter name `prisma`, and every interactive-transaction
 * callback in this codebase names its parameter `tx`):
 *   1. A direct delegate call on the six tenancy models:
 *      `(this.)?(prisma|tx).<model>.<operation>(`
 *   2. The `tenantMemberships` relation-include key (the one legitimate
 *      existing access pattern that is NOT a direct delegate call —
 *      `JwtStrategy` loads a `User`'s own memberships via
 *      `prisma.user.findUnique({ include: { tenantMemberships: {...} } })`).
 *
 * Do not weaken this guard to make an unapproved import pass — the correct
 * fix for a genuine new cross-tenant need is to add the specific file to
 * the allowlist below with a comment explaining why, the same discipline
 * `migration-safety.spec.ts`'s `LEGACY_MIGRATIONS` and G-19/D4-G-20
 * extensions already follow in this codebase.
 */

const SRC_DIR = join(__dirname);

const TENANCY_MODELS = [
  'tenant',
  'store',
  'storeDomain',
  'tenantMembership',
  'subscription',
  'customer',
] as const;

const DIRECT_DELEGATE_PATTERN = new RegExp(
  `\\b(?:this\\.)?(?:prisma|tx)\\.(?:${TENANCY_MODELS.join('|')})\\.\\w+\\(`,
);
const MEMBERSHIP_INCLUDE_PATTERN = /\btenantMemberships\s*:\s*\{/;

/**
 * Explicitly approved bypass sites (SaaS Master Plan §9 "platform-scoped
 * operations identified explicitly"; independent audit finding). Paths are
 * relative to `backend/src/`. Adding an entry here is itself a decision —
 * see the file header.
 */
const ALLOWLIST: ReadonlyArray<{ path: string; category: string }> = [
  {
    path: 'common/tenant/tenant-context.guard.ts',
    category:
      'tenant-context.guard.ts (resolves a tenant FROM a hostname — no tenant is known yet)',
  },
  {
    path: 'auth/strategies/jwt.strategy.ts',
    category:
      "jwt.strategy.ts (loads a User's own memberships across every tenant they hold, before any tenant is selected)",
  },
  // "auth" — the rest of the auth module (identity is global; Master Plan
  // §9: "Auth endpoints — none [tenant context]"). No file here currently
  // matches the detection patterns; listed for completeness per the named
  // exemption category, not because it's needed to pass today.
  { path: 'auth/auth.service.ts', category: 'auth (identity is global)' },
  { path: 'auth/auth.controller.ts', category: 'auth (identity is global)' },
  // "health" — no tenant context at all (Master Plan §9).
  {
    path: 'common/health/health.controller.ts',
    category: 'health (no tenant context)',
  },
  // "cron pollers" — iterate across every tenant by design; the *poller*
  // is never scoped to one tenant (Master Plan §9); each *job* carries
  // tenant context (Phase 11), not modeled here.
  {
    path: 'payments/payment-reconciliation.service.ts',
    category: 'cron poller',
  },
  {
    path: 'payments/webhooks/webhook-processor.service.ts',
    category: 'cron poller',
  },
  { path: 'notifications/outbox/outbox.poller.ts', category: 'cron poller' },
  // "platform admin" — cross-tenant by design (Phase 5, SUPER_ADMIN +
  // audit). No file exists yet; reserved so Phase 5 does not need to
  // reopen this guard to add its first entry.
];

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

interface Violation {
  relativePath: string;
  reason: string;
}

function findViolations(): Violation[] {
  const allowedPaths = new Set(ALLOWLIST.map((a) => a.path));
  const violations: Violation[] = [];

  for (const absPath of walk(SRC_DIR)) {
    const relativePath = absPath.slice(SRC_DIR.length + 1);
    if (allowedPaths.has(relativePath)) {
      continue;
    }
    // The scoping mechanism's own implementation is generic ($allModels)
    // and never names a tenancy model literally — it would not match
    // either pattern, but is excluded on principle, not necessity.
    if (relativePath.startsWith('common/tenant/tenant-prisma.ts')) {
      continue;
    }

    const code = stripComments(readFileSync(absPath, 'utf8'));
    if (DIRECT_DELEGATE_PATTERN.test(code)) {
      violations.push({
        relativePath,
        reason:
          'direct PrismaService delegate call on a tenancy model outside the allowlist',
      });
      continue;
    }
    if (MEMBERSHIP_INCLUDE_PATTERN.test(code)) {
      violations.push({
        relativePath,
        reason: '`tenantMemberships` relation include outside the allowlist',
      });
    }
  }

  return violations;
}

describe('tenant data access — PrismaService allowlist guard (D4, Phase 3)', () => {
  it('every allowlisted file actually exists', () => {
    for (const entry of ALLOWLIST) {
      expect(() =>
        readFileSync(join(SRC_DIR, entry.path), 'utf8'),
      ).not.toThrow();
    }
  });

  it('the two known, currently-existing access sites are exactly jwt.strategy.ts and tenant-context.guard.ts', () => {
    const detectedTodayFiles = ALLOWLIST.filter((a) => {
      try {
        const code = stripComments(readFileSync(join(SRC_DIR, a.path), 'utf8'));
        return (
          DIRECT_DELEGATE_PATTERN.test(code) ||
          MEMBERSHIP_INCLUDE_PATTERN.test(code)
        );
      } catch {
        return false;
      }
    }).map((a) => a.path);
    expect(detectedTodayFiles.sort()).toEqual(
      [
        'auth/strategies/jwt.strategy.ts',
        'common/tenant/tenant-context.guard.ts',
      ].sort(),
    );
  });

  it('no file outside the allowlist accesses a tenancy model directly', () => {
    const violations = findViolations();
    expect(violations).toEqual([]);
  });

  it('the detector actually fires on a direct, unauthorized delegate call (positive control)', () => {
    const code =
      'async function f(prisma) { return prisma.customer.findMany({}); }';
    expect(DIRECT_DELEGATE_PATTERN.test(code)).toBe(true);
  });

  it('the detector actually fires on an unauthorized tenantMemberships include (positive control)', () => {
    const code =
      'prisma.user.findUnique({ include: { tenantMemberships: { where: {} } } })';
    expect(MEMBERSHIP_INCLUDE_PATTERN.test(code)).toBe(true);
  });

  it('the detector does NOT fire on an unrelated "customer" identifier that is not a Prisma delegate call', () => {
    const code =
      'const customer = { name: "test" }; console.log(customer.email);';
    expect(DIRECT_DELEGATE_PATTERN.test(code)).toBe(false);
  });

  it('the detector does NOT fire on the tenant-scoped client itself ($allModels is generic, names no model literally)', () => {
    const code = readFileSync(
      join(SRC_DIR, 'common/tenant/tenant-prisma.ts'),
      'utf8',
    );
    const stripped = stripComments(code);
    expect(DIRECT_DELEGATE_PATTERN.test(stripped)).toBe(false);
    expect(MEMBERSHIP_INCLUDE_PATTERN.test(stripped)).toBe(false);
  });
});
