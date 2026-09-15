import { readFileSync, readdirSync } from 'fs';
import { dirname, isAbsolute, join, relative, resolve } from 'path';

/**
 * Phase 7 final closeout — frozen SaaS invariant 6 (docs/saas/DECISIONS.md
 * P7-D1/P7-D2 consequences: "Billing-provider-dependent work … remains
 * blocked …"; master plan §13 "Kept structurally separate from merchant
 * commerce payments"): SaaS subscription billing and merchant commerce
 * payments must never share code or a database table. This was true by
 * manual inspection at the close of Phase 7 Wave A/B (`dc83144` and its
 * ancestors) but had no automated proof — this guard mechanically enforces
 * it going forward, the same "flag, never silently decide" discipline
 * `tenant-data-access-guard.spec.ts` and `audit.schema.spec.ts` already
 * apply to their own frozen invariants.
 *
 * Two independent checks:
 *   1. SOURCE IMPORT SEPARATION — no file under `src/subscriptions/`
 *      imports from `src/payments/`, and no file under `src/payments/`
 *      imports from `src/subscriptions/`.
 *   2. DATABASE MODEL SEPARATION — `Subscription`/`SubscriptionEvent`/
 *      `BillingWebhookEvent` (SaaS billing) never relate, by Prisma
 *      `@relation`/field-type, to `PaymentAttempt`/`Refund`/`WebhookEvent`
 *      (merchant commerce), in either direction, and the six models map to
 *      six distinct tables.
 *
 * Unit-level, static/structural only — no database connection, no schema
 * or migration change, no production code touched.
 */

const SRC_DIR = join(__dirname);
const SUBSCRIPTIONS_DIR = join(SRC_DIR, 'subscriptions');
const PAYMENTS_DIR = join(SRC_DIR, 'payments');

// ─── 1. Source import separation ─────────────────────────────────────────

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

/**
 * Every internal import in this codebase is relative (verified across all
 * of `src/`: zero non-relative, non-package specifiers exist) and every
 * form actually used here is `import/export ... from '<specifier>'`,
 * `import '<specifier>'` (side-effect), or `import('<specifier>')`
 * (dynamic) — all three are matched, so a future developer introducing any
 * of them still trips this guard. Comments are stripped first so a prose
 * mention of a path is never mistaken for a real specifier.
 */
function extractImportSpecifiers(code: string): string[] {
  const stripped = stripComments(code);
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /^\s*import\s+['"]([^'"]+)['"]/gm,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of stripped.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function isInside(childAbs: string, parentAbs: string): boolean {
  const rel = relative(parentAbs, childAbs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

interface ImportViolation {
  file: string;
  specifier: string;
  resolvedInto: string;
}

/**
 * Resolves each relative specifier against the IMPORTING file's own
 * directory (never string-matched) — required because both
 * `subscriptions/` (`dto/`, `state-machine/`) and `payments/` (`dto/`,
 * `razorpay/`, `webhooks/`) have their own subdirectories, so the correct
 * `../` depth to reach the other module differs by file. A package
 * specifier (no leading `.`) is skipped — neither module is an npm
 * package, so it can never be the target of a real cross-boundary import.
 */
function findCrossImports(
  sourceDir: string,
  forbiddenDir: string,
  forbiddenLabel: string,
): ImportViolation[] {
  const violations: ImportViolation[] = [];
  for (const absFile of walk(sourceDir)) {
    const code = readFileSync(absFile, 'utf8');
    for (const specifier of extractImportSpecifiers(code)) {
      if (!specifier.startsWith('.')) {
        continue;
      }
      const resolved = resolve(dirname(absFile), specifier);
      if (isInside(resolved, forbiddenDir)) {
        violations.push({
          file: relative(SRC_DIR, absFile),
          specifier,
          resolvedInto: forbiddenLabel,
        });
      }
    }
  }
  return violations;
}

function describeViolations(violations: ImportViolation[]): string[] {
  return violations.map(
    (v) =>
      `${v.file} imports '${v.specifier}' (resolves into ${v.resolvedInto}/)`,
  );
}

// ─── 2. Database model separation ────────────────────────────────────────

const schema = readFileSync(
  join(__dirname, '..', 'prisma', 'schema.prisma'),
  'utf8',
);

/** Same idiom `audit.schema.spec.ts` already established for this repo. */
function modelBody(modelName: string): string {
  const re = new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = re.exec(schema);
  expect(match).not.toBeNull();
  return match![1];
}

const SAAS_BILLING_MODELS = [
  'Subscription',
  'SubscriptionEvent',
  'BillingWebhookEvent',
] as const;
const COMMERCE_PAYMENT_MODELS = [
  'PaymentAttempt',
  'Refund',
  'WebhookEvent',
  // Phase 8 (P8-D3/P8-D6) — merchant payment account. Added here (P8-3
  // architecture spec §10 implementation-sequence item 9) so the existing
  // cross-model-relation checks below actually cover it in both
  // directions, exactly as they already do for the three original models.
  'PaymentAccount',
] as const;

/**
 * Matches a field declaration whose TYPE (not name) is one of the given
 * model names — singular or a list-relation (`Foo[]`), optional or not.
 * Anchored to start-of-line-after-whitespace so a field NAMED e.g.
 * `refundReason` never false-matches on a forbidden model name appearing
 * only as a substring of its own name.
 */
function fieldTypedAsAnyOf(modelNames: readonly string[]): RegExp {
  return new RegExp(
    `\\n\\s*\\w+\\s+(?:${modelNames.join('|')})(?:\\[\\])?\\??\\b`,
  );
}

function mapTableName(body: string): string {
  const match = /@@map\("([^"]+)"\)/.exec(body);
  expect(match).not.toBeNull();
  return match![1];
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('money-flow separation — Invariant 6 (Phase 7 final closeout)', () => {
  describe('source import separation', () => {
    it('no file under subscriptions/ imports (statically, side-effect, or dynamically) from payments/', () => {
      const violations = findCrossImports(
        SUBSCRIPTIONS_DIR,
        PAYMENTS_DIR,
        'payments',
      );
      expect(describeViolations(violations)).toEqual([]);
    });

    it('no file under payments/ imports (statically, side-effect, or dynamically) from subscriptions/', () => {
      const violations = findCrossImports(
        PAYMENTS_DIR,
        SUBSCRIPTIONS_DIR,
        'subscriptions',
      );
      expect(describeViolations(violations)).toEqual([]);
    });

    it('extractImportSpecifiers finds every import/export/dynamic-import form used in this codebase, and ignores comments (positive control)', () => {
      const code = `
        import { Foo } from '../payments/foo';
        import Bar from '../../payments/bar';
        import * as Baz from './x';
        export { Qux } from '../payments/qux';
        export * from '../payments/all';
        import '../payments/side-effect';
        const p = import('../payments/dynamic');
        // a comment mentioning from '../payments/not-real' must be ignored
        /* another comment: from '../payments/also-not-real' */
      `;
      expect(extractImportSpecifiers(code).sort()).toEqual(
        [
          '../payments/foo',
          '../../payments/bar',
          './x',
          '../payments/qux',
          '../payments/all',
          '../payments/side-effect',
          '../payments/dynamic',
        ].sort(),
      );
    });

    it('a package specifier (no leading dot) is extracted but never treated as a cross-boundary import (negative control)', () => {
      const specifiers = extractImportSpecifiers(
        "import { Injectable } from '@nestjs/common';",
      );
      expect(specifiers).toEqual(['@nestjs/common']);
      // findCrossImports skips these — proven by the real, full-codebase
      // checks above passing despite every file importing '@nestjs/common'.
    });

    it('isInside correctly resolves a relative specifier across differing subdirectory depths (positive control)', () => {
      // subscriptions/dto/ is one level deeper than subscriptions/ itself
      // — reaching payments/ from there needs an extra '../', exactly the
      // depth difference findCrossImports must get right per-file.
      const fromNestedDir = join(SUBSCRIPTIONS_DIR, 'dto');
      const resolvedFromNested = resolve(
        fromNestedDir,
        '../../payments/webhooks/webhook-processor.service',
      );
      const fromTopLevelDir = SUBSCRIPTIONS_DIR;
      const resolvedFromTopLevel = resolve(
        fromTopLevelDir,
        '../payments/webhooks/webhook-processor.service',
      );
      expect(isInside(resolvedFromNested, PAYMENTS_DIR)).toBe(true);
      expect(isInside(resolvedFromTopLevel, PAYMENTS_DIR)).toBe(true);
      expect(resolvedFromNested).toBe(resolvedFromTopLevel);
    });

    it('isInside does NOT fire on a resolved path that merely starts with the same prefix as the forbidden directory', () => {
      // e.g. a hypothetical 'src/payments-adjacent/' must never be treated
      // as inside 'src/payments/' via a naive string startsWith check.
      const lookalike = join(SRC_DIR, 'payments-adjacent', 'file.ts');
      expect(isInside(lookalike, PAYMENTS_DIR)).toBe(false);
    });
  });

  describe('database model separation', () => {
    const billingBodies: Record<string, string> = Object.fromEntries(
      SAAS_BILLING_MODELS.map((m) => [m, modelBody(m)]),
    );
    const commerceBodies: Record<string, string> = Object.fromEntries(
      COMMERCE_PAYMENT_MODELS.map((m) => [m, modelBody(m)]),
    );

    it.each(SAAS_BILLING_MODELS)(
      '%s has no field typed as a merchant commerce payment model',
      (modelName) => {
        expect(billingBodies[modelName]).not.toMatch(
          fieldTypedAsAnyOf(COMMERCE_PAYMENT_MODELS),
        );
      },
    );

    it.each(COMMERCE_PAYMENT_MODELS)(
      '%s has no field typed as a SaaS billing model',
      (modelName) => {
        expect(commerceBodies[modelName]).not.toMatch(
          fieldTypedAsAnyOf(SAAS_BILLING_MODELS),
        );
      },
    );

    it('the six models map to six distinct tables — no shared @@map name', () => {
      const allBodies = { ...billingBodies, ...commerceBodies };
      const allModelNames = [
        ...SAAS_BILLING_MODELS,
        ...COMMERCE_PAYMENT_MODELS,
      ];
      const tableNames = allModelNames.map((m) => mapTableName(allBodies[m]));
      expect(new Set(tableNames).size).toBe(allModelNames.length);
    });

    it('BillingWebhookEvent and WebhookEvent (the two webhook tables) carry no relation to one another', () => {
      expect(billingBodies.BillingWebhookEvent).not.toMatch(
        fieldTypedAsAnyOf(['WebhookEvent']),
      );
      expect(commerceBodies.WebhookEvent).not.toMatch(
        fieldTypedAsAnyOf(['BillingWebhookEvent']),
      );
    });

    it('the field-type detector actually fires on a real cross-reference (positive control)', () => {
      const fakeBody =
        '\n  id String @id\n  paymentAttempt PaymentAttempt @relation(fields: [paymentAttemptId], references: [id])\n';
      expect(fakeBody).toMatch(fieldTypedAsAnyOf(['PaymentAttempt']));
    });

    it('the field-type detector does NOT fire on a field whose NAME merely contains a forbidden model name as a substring (negative control)', () => {
      const fakeBody = '\n  id String @id\n  refundReason String?\n';
      expect(fakeBody).not.toMatch(fieldTypedAsAnyOf(['Refund']));
    });

    it('all six models actually exist in schema.prisma today (sanity check — modelBody() would already have thrown otherwise)', () => {
      for (const name of [...SAAS_BILLING_MODELS, ...COMMERCE_PAYMENT_MODELS]) {
        expect(schema).toMatch(new RegExp(`model ${name} \\{`));
      }
    });
  });
});
