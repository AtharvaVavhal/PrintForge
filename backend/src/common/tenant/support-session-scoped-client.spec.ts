import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getSupportSessionScopedClient } from './support-session-scoped-client';

/**
 * Phase 5 W5. Unit + static tests for the SupportSession scoped-client
 * primitive. Real cross-tenant row isolation and transaction propagation
 * are proven against a real Postgres DB in
 * `test/e2e/support-session-scoped-client.e2e-spec.ts`; this file covers
 * the primitive's own logic (delegation, fail-closed behavior) and the
 * static guarantees P5-D8 requires (no unscoped/bypass-shaped export, and —
 * updated for Phase 5 W6, which is the real SupportSession implementation
 * this file's guards originally anticipated and named as the expected next
 * consumer — an exact, enumerated set of the files that legitimately exist
 * for it, rather than the "zero files" assertion that was correct only
 * before W6 started).
 */

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function makeFakePrisma() {
  return { $extends: jest.fn().mockReturnValue({ scoped: true }) };
}

describe('getSupportSessionScopedClient', () => {
  it('delegates to the D4 tenant-scoped client mechanism (calls $extends on the given prisma instance) and returns its result unchanged', () => {
    const prisma = makeFakePrisma();
    const result = getSupportSessionScopedClient(prisma as never, {
      tenantId: 'tenant-a',
      source: 'support-session',
    });
    expect(prisma.$extends).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scoped: true });
  });

  it('fails closed and never calls $extends when tenantId is an empty string', () => {
    const prisma = makeFakePrisma();
    expect(() =>
      getSupportSessionScopedClient(prisma as never, {
        tenantId: '',
        source: 'support-session',
      }),
    ).toThrow(/refusing to create an unscoped client/);
    expect(prisma.$extends).not.toHaveBeenCalled();
  });

  it('fails closed and never calls $extends when the identity itself is missing', () => {
    const prisma = makeFakePrisma();
    expect(() =>
      getSupportSessionScopedClient(prisma as never, undefined as never),
    ).toThrow(/refusing to create an unscoped client/);
    expect(prisma.$extends).not.toHaveBeenCalled();
  });
});

describe('W5 static guardrails (P5-D8)', () => {
  const SRC_DIR = join(__dirname, '..', '..');
  const THIS_PACKAGE_FILES = new Set([
    'support-session-scoped-client.ts',
    'support-session-scoped-client.spec.ts',
  ]);

  function walk(dir: string, files: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, files);
      } else if (entry.name.endsWith('.ts')) {
        files.push(full);
      }
    }
    return files;
  }

  it('exports exactly one function — no createUnscopedClient/createPlatformClient/bypassTenantIsolation-shaped API', () => {
    const mod: Record<string, unknown> = jest.requireActual(
      './support-session-scoped-client',
    );
    expect(Object.keys(mod)).toEqual(['getSupportSessionScopedClient']);
  });

  // Phase 5 W6 is the real SupportSession implementation this file's own
  // header always named as the expected next consumer — this is an exact
  // enumeration (mirroring `platform.guard.spec.ts`'s own "exact,
  // enumerated @PlatformOnly() usage set" convention), not a blanket
  // "nothing exists" assertion: it still catches any FUTURE accidental or
  // unauthorized support-session-named file the same way that convention
  // catches an unauthorized `@PlatformOnly()` route.
  const KNOWN_W6_FILES = new Set([
    'support-session-context.guard.ts',
    'support-session-context.guard.spec.ts',
    'support-session.module.ts',
    'support-session.controller.ts',
    'support-session.service.ts',
    'support-session.service.spec.ts',
    'create-support-session.dto.ts',
    'list-support-sessions-query.dto.ts',
    'support-session-view.interface.ts',
  ]);

  it('every support-session-named file under src/ is exactly this W5 primitive, its spec, or the known, enumerated Phase 5 W6 SupportSession implementation set — nothing unaccounted for', () => {
    const found = walk(SRC_DIR)
      .map((f) => f.split('/').pop() as string)
      .filter((name) => /support.?session/i.test(name));
    const unaccountedFor = found.filter(
      (name) => !THIS_PACKAGE_FILES.has(name) && !KNOWN_W6_FILES.has(name),
    );
    expect(unaccountedFor).toEqual([]);
    // And the reverse: every file this test expects to exist actually does
    // (catches a rename/move as loudly as an unauthorized addition).
    for (const name of KNOWN_W6_FILES) {
      expect(found).toContain(name);
    }
  });

  it("still has zero real call sites anywhere in src/ even after Phase 5 W6 (checked against CODE only, comments stripped — support-session.service.ts's own header comment explains, in prose, why it deliberately does NOT call this, which would otherwise false-positive a plain substring scan)", () => {
    const importers = walk(SRC_DIR)
      .filter((f) => !f.endsWith('.spec.ts'))
      .filter((f) => !THIS_PACKAGE_FILES.has(f.split('/').pop() as string))
      .filter((f) =>
        stripComments(readFileSync(f, 'utf8')).includes(
          'getSupportSessionScopedClient',
        ),
      )
      .map((f) => f.slice(SRC_DIR.length + 1));
    expect(importers).toEqual([]);
  });
});
