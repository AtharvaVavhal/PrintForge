import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * G-10 — Additive-only migration safety guard (SaaS Master Plan Phase 1;
 * docs/saas/PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12 / AC-10;
 * approved in docs/saas/DECISIONS.md). Extended by **G-19** for Phase 2a
 * (docs/saas/DECISIONS.md v1.2; docs/saas/PHASE-2-DECISION-RESOLUTION-AND-SPEC.md
 * §B.11.3 / §C.4).
 *
 * From Phase 1 onward, every new Prisma migration must be **additive-only**.
 * Allowed:
 *   - `CREATE TABLE` / `CREATE TYPE` / `CREATE INDEX` / `CREATE UNIQUE INDEX`
 *   - `ALTER TABLE <t> ...` when `<t>` is CREATEd in the same migration file
 *     (this is how Prisma always emits FK creation), and even then not
 *     `SET NOT NULL`.
 *   - **(G-19)** a *single, purely-additive nullable* `ALTER TABLE <existing>
 *     ADD COLUMN "<c>" <type>` on a table an earlier migration created — and
 *     ONLY that: no `NOT NULL`, no `DEFAULT`, no second action in the same
 *     statement. This is what Phase 2a's `ALTER TABLE "users" ADD COLUMN
 *     "platformRole" "PlatformRole"` needs, and what Phase 4's expand steps
 *     will need. It stays safe because a nullable column with no default is an
 *     instant metadata-only change that back-fills nothing and locks nothing.
 * Forbidden anywhere (unchanged — G-19 does NOT weaken these):
 *   - DROP (table / column / index / constraint / type / schema / view / sequence)
 *   - DELETE / TRUNCATE / UPDATE of rows
 *   - SET NOT NULL
 *   - `ALTER TABLE` on a table NOT created in the same file for ANYTHING other
 *     than the one narrow nullable-ADD-COLUMN case above — a type change, a
 *     DEFAULT, a NOT NULL, an ADD CONSTRAINT, a RENAME, a multi-action ALTER,
 *     etc. are all still rejected (Phase 4's contract work still needs explicit
 *     review; Phase 1 risk P1-R6, scope creep).
 *
 * The detector validates **each migration file as self-contained** — it does not
 * model the cumulative schema across earlier migrations (per audit finding P2-4:
 * option A, "keep it simple"). A migration that needs a non-additive change to
 * an earlier-migration table must still go to LEGACY_MIGRATIONS **with a written
 * justification in the migration's own comment and in docs/saas/DECISIONS.md**.
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
        // G-19 (docs/saas/DECISIONS.md v1.2): the ONE permitted change to an
        // earlier-migration table is a single, purely-additive *nullable*
        // ADD COLUMN — no NOT NULL, no DEFAULT, no second action. Everything
        // else on a pre-existing table (type change, DEFAULT, NOT NULL, ADD
        // CONSTRAINT, RENAME, multi-action) is still rejected.
        const addColumnOnly =
          /^ALTER\s+TABLE\s+(?:ONLY\s+)?"[^"]+"\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"[^"]+"\s+\S/i.test(
            stmt,
          );
        const singleAction = !/,\s*(?:ADD|DROP|ALTER|RENAME)\b/i.test(upper);
        const hasNotNull = /\bNOT\s+NULL\b/.test(upper);
        const hasDefault = /\bDEFAULT\b/.test(upper);
        if (addColumnOnly && singleAction && !hasNotNull && !hasDefault) {
          continue; // approved additive nullable ADD COLUMN (G-19)
        }
        violations.push(
          `ALTER TABLE on a table not created in this migration ("${target}") is not allowed in an additive migration ` +
            `(G-19 permits ONLY a single nullable ADD COLUMN with no DEFAULT / NOT NULL): ${stmt.slice(0, 120)}`,
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

    it('rejects a NON-additive ALTER TABLE on a table not created in the same migration', () => {
      const v = findAdditiveOnlyViolations(
        'ALTER TABLE "orders" ADD COLUMN "note" TEXT NOT NULL;',
      );
      expect(v.join(' ')).toMatch(
        /ALTER TABLE on a table not created in this migration \("orders"\)/,
      );
    });

    // G-19 (docs/saas/DECISIONS.md v1.2): a single, purely-additive *nullable*
    // ADD COLUMN on an earlier-migration table is now permitted — and ONLY that.
    it('G-19: permits a single nullable ADD COLUMN on an earlier-migration table', () => {
      expect(
        findAdditiveOnlyViolations(
          'ALTER TABLE "users" ADD COLUMN "platformRole" "PlatformRole";',
        ),
      ).toEqual([]);
      expect(
        findAdditiveOnlyViolations(
          'CREATE TABLE "customers" ("id" TEXT NOT NULL); ALTER TABLE "tenants" ADD COLUMN "x" TEXT;',
        ),
      ).toEqual([]);
    });

    it('G-19: still rejects everything else on an earlier-migration table', () => {
      const cases = [
        'ALTER TABLE "users" ADD COLUMN "x" TEXT NOT NULL;', // NOT NULL
        `ALTER TABLE "users" ADD COLUMN "x" TEXT DEFAULT 'y';`, // DEFAULT
        'ALTER TABLE "users" ADD COLUMN "x" TEXT, ADD COLUMN "z" TEXT;', // multi-action
        'ALTER TABLE "users" ADD COLUMN "x" TEXT, DROP COLUMN "y";', // multi-action w/ drop
        'ALTER TABLE "users" ALTER COLUMN "email" TYPE TEXT;', // type change
        'ALTER TABLE "orders" ADD CONSTRAINT "c" FOREIGN KEY ("x") REFERENCES "y"("id");', // add constraint
        'ALTER TABLE "users" RENAME COLUMN "email" TO "mail";', // rename
      ];
      for (const sql of cases) {
        expect(findAdditiveOnlyViolations(sql)).not.toHaveLength(0);
      }
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
