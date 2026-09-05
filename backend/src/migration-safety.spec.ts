import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * G-10 — Additive-only migration safety guard (SaaS Master Plan Phase 1;
 * docs/saas/PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12 / AC-10;
 * approved in docs/saas/DECISIONS.md).
 *
 * From Phase 1 onward, every new Prisma migration must be **additive-only**.
 * Allowed:
 *   - `CREATE TABLE` / `CREATE TYPE` / `CREATE INDEX` / `CREATE UNIQUE INDEX`
 *   - `ALTER TABLE <t> ...` **only when `<t>` is CREATEd in the same migration
 *     file** (this is how Prisma always emits FK creation), and even then not
 *     `SET NOT NULL`.
 * Forbidden anywhere:
 *   - DROP (table / column / index / constraint / type / schema / view / sequence)
 *   - DELETE / TRUNCATE / UPDATE of rows
 *   - `ALTER TABLE` on any table NOT created in the same file (covers adding a
 *     column, changing a type, dropping a default, etc. on a table an earlier
 *     migration created — Phase 4's expand->contract work will need explicit
 *     review, which is the point: Phase 1 risk P1-R6, scope creep)
 *   - SET NOT NULL
 *
 * The detector validates **each migration file as self-contained** — it does not
 * model the cumulative schema across earlier migrations (per audit finding P2-4:
 * option A, "keep it simple"). Consequence: a later phase that legitimately
 * needs an additive `ALTER TABLE <earlier-table> ADD COLUMN` must either split
 * it so the change ships in the migration that created the table, or add that
 * migration to LEGACY_MIGRATIONS **with a written justification in the
 * migration's own comment and in docs/saas/DECISIONS.md**.
 *
 * This runs inside the existing `npm run test` job (same as
 * scheduler-registration.spec.ts), so CI enforces it with no new workflow.
 */

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');

/**
 * Migrations created BEFORE the G-10 guard existed (the original single-tenant
 * schema build). These legitimately contain e.g. `UPDATE "orders"` (the
 * 20260902 tax backfill) and are exempt. Do NOT add to this list without a
 * recorded decision (see the file header).
 */
const LEGACY_MIGRATIONS = new Set<string>([
  '20260825190725_init',
  '20260826084257_add_refunds',
  '20260826214205_add_product_image_delivery_fields',
  '20260827180334_add_order_shipping_fee',
  '20260827193208_add_reviews',
  '20260827204110_add_coupons',
  '20260831213237_add_category_is_active',
  '20260901211106_webhook_event_bounded_retry',
  '20260902031308_order_tax_snapshot_and_invoices',
]);

/** Strip `-- line` and `/* block *\/` comments so prose can't trip the scan. */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** Table names created by `CREATE TABLE "x"` in this migration file. */
function tablesCreatedIn(sql: string): Set<string> {
  const created = new Set<string>();
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    created.add(m[1]);
  }
  return created;
}

/**
 * Returns a list of additive-only violations found in one migration's SQL,
 * validating the file **as self-contained** (see the file header). Empty array
 * = additive-only.
 */
export function findAdditiveOnlyViolations(rawSql: string): string[] {
  const sql = stripSqlComments(rawSql);
  const violations: string[] = [];
  const newInThisFile = tablesCreatedIn(sql);

  // Split into statements on `;` — good enough for Prisma-generated + our
  // hand-added SQL (no PL/pgSQL bodies in these migrations).
  const statements = sql
    .split(';')
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  for (const stmt of statements) {
    const upper = stmt.toUpperCase();

    if (
      /\bDROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT|TYPE|SCHEMA|VIEW|SEQUENCE)\b/.test(
        upper,
      )
    ) {
      violations.push(`DROP is not allowed: ${stmt.slice(0, 120)}`);
      continue;
    }
    if (/\bTRUNCATE\b/.test(upper)) {
      violations.push(`TRUNCATE is not allowed: ${stmt.slice(0, 120)}`);
      continue;
    }
    if (/^DELETE\s+FROM\b/.test(upper)) {
      violations.push(`DELETE is not allowed: ${stmt.slice(0, 120)}`);
      continue;
    }
    if (/^UPDATE\s+"?[A-Z_]/i.test(stmt)) {
      violations.push(
        `UPDATE of existing rows is not allowed: ${stmt.slice(0, 120)}`,
      );
      continue;
    }

    const alter = stmt.match(/^ALTER\s+TABLE\s+(?:ONLY\s+)?"([^"]+)"/i);
    if (alter) {
      const target = alter[1];
      if (!newInThisFile.has(target)) {
        violations.push(
          `ALTER TABLE on a table not created in this migration ("${target}") is not allowed in an additive migration: ${stmt.slice(0, 120)}`,
        );
        continue;
      }
      // ALTER on a table created in THIS file — ADD CONSTRAINT / ADD COLUMN is
      // fine (Prisma FK creation), but never SET NOT NULL.
      if (/\bSET\s+NOT\s+NULL\b/.test(upper)) {
        violations.push(`SET NOT NULL is not allowed: ${stmt.slice(0, 120)}`);
      }
      continue;
    }

    if (/\bSET\s+NOT\s+NULL\b/.test(upper)) {
      violations.push(`SET NOT NULL is not allowed: ${stmt.slice(0, 120)}`);
      continue;
    }

    // Everything else must be a CREATE (TABLE/TYPE/INDEX/UNIQUE INDEX/EXTENSION)
    // or a comment-only fragment.
    if (upper && !/^CREATE\b/.test(upper)) {
      violations.push(
        `Unexpected non-additive statement: ${stmt.slice(0, 120)}`,
      );
    }
  }

  return violations;
}

describe('migration safety — additive-only guard (G-10)', () => {
  describe('findAdditiveOnlyViolations() detector', () => {
    it('accepts CREATE TABLE / CREATE TYPE / CREATE INDEX', () => {
      const sql = `
        CREATE TYPE "Foo" AS ENUM ('A','B');
        CREATE TABLE "widgets" ("id" TEXT NOT NULL, CONSTRAINT "widgets_pkey" PRIMARY KEY ("id"));
        CREATE UNIQUE INDEX "widgets_id_key" ON "widgets"("id");
        CREATE INDEX "widgets_x" ON "widgets"("id") WHERE "id" IS NOT NULL;
      `;
      expect(findAdditiveOnlyViolations(sql)).toEqual([]);
    });

    it('accepts ALTER TABLE ADD CONSTRAINT FK on a table created in the same file', () => {
      const sql = `
        CREATE TABLE "widgets" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL);
        ALTER TABLE "widgets" ADD CONSTRAINT "widgets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      `;
      expect(findAdditiveOnlyViolations(sql)).toEqual([]);
    });

    it('rejects DROP TABLE', () => {
      expect(findAdditiveOnlyViolations('DROP TABLE "orders";')).toHaveLength(
        1,
      );
    });

    it('rejects DROP COLUMN', () => {
      expect(
        findAdditiveOnlyViolations('ALTER TABLE "orders" DROP COLUMN "total";'),
      ).not.toHaveLength(0);
    });

    it('rejects ALTER TABLE on a table not created in the same migration', () => {
      const v = findAdditiveOnlyViolations(
        'ALTER TABLE "orders" ADD COLUMN "note" TEXT;',
      );
      expect(v.join(' ')).toMatch(
        /ALTER TABLE on a table not created in this migration \("orders"\)/,
      );
    });

    it('rejects an additive ALTER on an earlier-migration table too (self-contained rule)', () => {
      // `tenants` is created by a *different* migration file, so an ALTER here
      // must be flagged even though ADD COLUMN is itself additive.
      const v = findAdditiveOnlyViolations(
        'CREATE TABLE "customers" ("id" TEXT NOT NULL); ALTER TABLE "tenants" ADD COLUMN "x" TEXT;',
      );
      expect(v).toHaveLength(1);
      expect(v[0]).toMatch(/\("tenants"\)/);
    });

    it('rejects DELETE / TRUNCATE / UPDATE of existing rows', () => {
      expect(findAdditiveOnlyViolations('DELETE FROM "orders";')).toHaveLength(
        1,
      );
      expect(
        findAdditiveOnlyViolations('TRUNCATE TABLE "orders";'),
      ).toHaveLength(1);
      expect(
        findAdditiveOnlyViolations(`UPDATE "orders" SET "total" = 0;`),
      ).toHaveLength(1);
    });

    it('does not flag ON UPDATE CASCADE inside a FK clause', () => {
      const sql = `
        CREATE TABLE "widgets" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL);
        ALTER TABLE "widgets" ADD CONSTRAINT "fk" FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE CASCADE;
      `;
      expect(findAdditiveOnlyViolations(sql)).toEqual([]);
    });

    it('rejects SET NOT NULL (even on a table created in the same file)', () => {
      expect(
        findAdditiveOnlyViolations(
          'CREATE TABLE "widgets" ("x" TEXT); ALTER TABLE "widgets" ALTER COLUMN "x" SET NOT NULL;',
        ),
      ).not.toHaveLength(0);
    });

    it('is not fooled by the words DROP/DELETE inside a comment', () => {
      const sql = `
        -- this migration does not DROP or DELETE anything
        /* nothing is dropped here */
        CREATE TABLE "widgets" ("id" TEXT NOT NULL);
      `;
      expect(findAdditiveOnlyViolations(sql)).toEqual([]);
    });
  });

  describe('every non-legacy migration on disk is additive-only', () => {
    const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    const guarded = dirs.filter((d) => !LEGACY_MIGRATIONS.has(d));

    it('there is at least one guarded (Phase 1+) migration', () => {
      expect(guarded.length).toBeGreaterThan(0);
    });

    it.each(guarded)('%s contains only additive SQL', (dir) => {
      const sql = readFileSync(
        join(MIGRATIONS_DIR, dir, 'migration.sql'),
        'utf8',
      );
      expect(findAdditiveOnlyViolations(sql)).toEqual([]);
    });

    it('every legacy migration name in the exemption list actually exists', () => {
      for (const legacy of LEGACY_MIGRATIONS) {
        expect(dirs).toContain(legacy);
      }
    });
  });
});
