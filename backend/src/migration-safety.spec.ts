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
 *     / `CREATE POLICY` (a `CREATE`, already covered by the catch-all below)
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
 *   - **(Phase 3 / D4 / G-20)** `ALTER TABLE <existing> ENABLE ROW LEVEL
 *     SECURITY` and `ALTER TABLE <existing> FORCE ROW LEVEL SECURITY` — and
 *     ONLY those two verbs, alone, on an existing table. A narrow extension
 *     of the same shape as G-19's, following its own precedent ("a narrow
 *     detector refinement with positive + negative tests") rather than a
 *     `LEGACY_MIGRATIONS` escape hatch. Justification: enabling/forcing RLS
 *     changes access-control metadata only — it touches no row, no column,
 *     no constraint, and is fully reversible via `DISABLE ROW LEVEL
 *     SECURITY`. This is what the D4-resolved (docs/saas/DECISIONS.md)
 *     RLS-enabling migration on the six Phase 1/2a tenancy tables needs.
 *   - **(Phase 4 W6 / P4-D3, docs/saas/DECISIONS.md)** a *single* `ALTER
 *     TABLE <existing> ADD CONSTRAINT "<name>" FOREIGN KEY ("tenantId"|
 *     "storeId", X) REFERENCES <other>("tenantId"|"storeId", X)` — a
 *     composite *ownership* FK — permitted ONLY when BOTH: (1) the exact
 *     structural shape matches, with the **same** scope token
 *     (`tenantId`/`storeId`) on both the local and referenced side
 *     (enforced via regex backreference, not merely "some ownership column
 *     on each side"), no second action in the same statement; AND (2) the
 *     constraint name, table, local column, and referenced table ALL match
 *     the canonical definition recorded for that name in the fixed, explicit
 *     `W6_APPROVED_COMPOSITE_FKS` map below (the exact 19 FKs named in
 *     `docs/saas/PHASE-4-W6-DECISION-DOCKET.md` §4.1) — an allowlisted name
 *     attached to hand-edited/wrong columns is rejected. Neither condition
 *     alone is sufficient — see that docket's §2 for the full rationale and
 *     the alternatives explicitly rejected (a bare shape-only or
 *     name-only exemption, or a generic `ADD CONSTRAINT` allowance). This
 *     exemption does NOT validate that the referenced table/columns
 *     actually exist or are unique yet — the guard remains a static,
 *     self-contained, per-file text scanner (unchanged design principle);
 *     that verification is a separate, required preflight step run by the
 *     operator before the migration (the W6 docket's own §6/§7 queries),
 *     never by this guard.
 * Forbidden anywhere (unchanged — G-19 and this extension do NOT weaken these):
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

/**
 * Phase 4 W6 / P4-D3 (docs/saas/DECISIONS.md; docs/saas/PHASE-4-W6-DECISION-DOCKET.md
 * §4.1) — the exact, fixed set of 19 composite ownership FK constraint names
 * this guard's W6 exemption permits. A composite FK matching the required
 * shape (see `findAdditiveOnlyViolations`) but named anything else is still
 * rejected. Do NOT add to this list without a recorded decision (same
 * discipline as `LEGACY_MIGRATIONS` above).
 */
interface CompositeFkDef {
  table: string;
  scopeToken: 'tenantId' | 'storeId';
  localCol: string;
  refTable: string;
}

const W6_APPROVED_COMPOSITE_FKS = new Map<string, CompositeFkDef>([
  [
    'categories_storeId_parentCategoryId_fkey',
    {
      table: 'categories',
      scopeToken: 'storeId',
      localCol: 'parentCategoryId',
      refTable: 'categories',
    },
  ],
  [
    'products_storeId_categoryId_fkey',
    {
      table: 'products',
      scopeToken: 'storeId',
      localCol: 'categoryId',
      refTable: 'categories',
    },
  ],
  [
    'product_images_storeId_productId_fkey',
    {
      table: 'product_images',
      scopeToken: 'storeId',
      localCol: 'productId',
      refTable: 'products',
    },
  ],
  [
    'product_variants_storeId_productId_fkey',
    {
      table: 'product_variants',
      scopeToken: 'storeId',
      localCol: 'productId',
      refTable: 'products',
    },
  ],
  [
    'customization_fields_storeId_productId_fkey',
    {
      table: 'customization_fields',
      scopeToken: 'storeId',
      localCol: 'productId',
      refTable: 'products',
    },
  ],
  [
    'cart_items_storeId_productId_fkey',
    {
      table: 'cart_items',
      scopeToken: 'storeId',
      localCol: 'productId',
      refTable: 'products',
    },
  ],
  [
    'cart_items_storeId_variantId_fkey',
    {
      table: 'cart_items',
      scopeToken: 'storeId',
      localCol: 'variantId',
      refTable: 'product_variants',
    },
  ],
  [
    'cart_item_customizations_storeId_customizationFieldId_fkey',
    {
      table: 'cart_item_customizations',
      scopeToken: 'storeId',
      localCol: 'customizationFieldId',
      refTable: 'customization_fields',
    },
  ],
  [
    'orders_storeId_couponId_fkey',
    {
      table: 'orders',
      scopeToken: 'storeId',
      localCol: 'couponId',
      refTable: 'coupons',
    },
  ],
  [
    'order_items_storeId_productId_fkey',
    {
      table: 'order_items',
      scopeToken: 'storeId',
      localCol: 'productId',
      refTable: 'products',
    },
  ],
  [
    'invoices_tenantId_orderId_fkey',
    {
      table: 'invoices',
      scopeToken: 'tenantId',
      localCol: 'orderId',
      refTable: 'orders',
    },
  ],
  [
    'payment_attempts_tenantId_orderId_fkey',
    {
      table: 'payment_attempts',
      scopeToken: 'tenantId',
      localCol: 'orderId',
      refTable: 'orders',
    },
  ],
  [
    'refunds_tenantId_paymentAttemptId_fkey',
    {
      table: 'refunds',
      scopeToken: 'tenantId',
      localCol: 'paymentAttemptId',
      refTable: 'payment_attempts',
    },
  ],
  [
    'order_status_history_tenantId_orderId_fkey',
    {
      table: 'order_status_history',
      scopeToken: 'tenantId',
      localCol: 'orderId',
      refTable: 'orders',
    },
  ],
  [
    'coupons_storeId_categoryId_fkey',
    {
      table: 'coupons',
      scopeToken: 'storeId',
      localCol: 'categoryId',
      refTable: 'categories',
    },
  ],
  [
    'coupon_usages_storeId_couponId_fkey',
    {
      table: 'coupon_usages',
      scopeToken: 'storeId',
      localCol: 'couponId',
      refTable: 'coupons',
    },
  ],
  [
    'coupon_usages_tenantId_orderId_fkey',
    {
      table: 'coupon_usages',
      scopeToken: 'tenantId',
      localCol: 'orderId',
      refTable: 'orders',
    },
  ],
  [
    'reviews_storeId_productId_fkey',
    {
      table: 'reviews',
      scopeToken: 'storeId',
      localCol: 'productId',
      refTable: 'products',
    },
  ],
  [
    'reviews_storeId_orderItemId_fkey',
    {
      table: 'reviews',
      scopeToken: 'storeId',
      localCol: 'orderItemId',
      refTable: 'order_items',
    },
  ],
]);

/**
 * Validates a single-action `ALTER TABLE "<table>" ADD CONSTRAINT "<name>"
 * FOREIGN KEY ("tenantId"|"storeId", X) REFERENCES "<refTable>"
 * ("tenantId"|"storeId", "id")` against the FULL canonical definition
 * recorded for `<name>` in `W6_APPROVED_COMPOSITE_FKS` — table, scope
 * token, local column, and referenced table must ALL match exactly (not
 * merely "some ownership column on each side"), the scope token must be
 * the SAME on both sides (regex backreference), and the referenced second
 * column must be exactly `"id"`. An allowlisted name attached to
 * hand-edited/wrong columns is rejected, same as an unlisted name. Static
 * text match only — does not confirm the referenced table/columns exist.
 */
function isApprovedCompositeOwnershipFk(stmt: string): boolean {
  const m =
    /^ALTER\s+TABLE\s+(?:ONLY\s+)?"([^"]+)"\s+ADD\s+CONSTRAINT\s+"([^"]+)"\s+FOREIGN\s+KEY\s*\(\s*"(tenantId|storeId)"\s*,\s*"([^"]+)"\s*\)\s+REFERENCES\s+"([^"]+)"\s*\(\s*"\3"\s*,\s*"([^"]+)"\s*\)/i.exec(
      stmt,
    );
  if (!m) {
    return false;
  }
  const [, table, name, scopeToken, localCol, refTable, refCol] = m;
  const def = W6_APPROVED_COMPOSITE_FKS.get(name);
  if (!def) {
    return false;
  }
  return (
    table === def.table &&
    scopeToken === def.scopeToken &&
    localCol === def.localCol &&
    refTable === def.refTable &&
    refCol === 'id'
  );
}

/**
 * Phase 4 W6 P1 fix (independent audit finding; see
 * docs/saas/PHASE-4-IMPLEMENTATION-REPORT.md §18) — ROOT CAUSE: the
 * previous `singleAction` check was a keyword blacklist
 * (`,\s*(?:ADD|DROP|ALTER|RENAME)\b`) that only rejected a second
 * comma-joined ALTER TABLE action if it happened to START with one of
 * those four words. Postgres has other top-level ALTER TABLE action verbs
 * that don't start with any of them — `DISABLE`/`ENABLE`/`FORCE`/
 * `NO FORCE ROW LEVEL SECURITY`, `OWNER TO`, `VALIDATE CONSTRAINT`,
 * `SET SCHEMA`, `SET TABLESPACE`, `CLUSTER ON`, etc. — none of which the
 * blacklist could ever be proven complete against. A second action using
 * any of those verbs, appended via comma to an otherwise-approved G-19
 * `ADD COLUMN` or P4-D3 composite FK statement, passed through completely
 * undetected (verified empirically before this fix).
 *
 * FIX: replace the blacklist with a structural, paren/quote-depth-aware
 * split of the ENTIRE action list following `ALTER TABLE "<table>"` into
 * top-level clauses (a comma inside `FOREIGN KEY ("tenantId", "x")` or
 * `DECIMAL(10,2)` is correctly kept inside its own clause, never mistaken
 * for a second action). `getSoleAlterTableActionClause` returns the one
 * clause only when there is structurally EXACTLY one — for ANY second
 * clause, regardless of which verb it uses. This proves "no additional
 * action is permitted in the same ALTER TABLE statement" (the exact P4-D3
 * requirement, `DECISIONS.md`) by counting real clauses, not by naming
 * forbidden verbs — so it cannot be incomplete the way a blacklist can.
 */
function splitTopLevelAlterActions(actionsText: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuotes = false;
  let current = '';
  for (const ch of actionsText) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (!inQuotes) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

/**
 * Returns the sole top-level action clause of an
 * `ALTER TABLE "<table>" <action1>[, <action2>, ...]` statement — the text
 * immediately following `ALTER TABLE "<table>" ` — but ONLY if there is
 * structurally exactly one top-level action. Returns `null` for two or
 * more (whatever the second one's verb is) — see the comment above.
 */
function getSoleAlterTableActionClause(stmt: string): string | null {
  const m = /^ALTER\s+TABLE\s+(?:ONLY\s+)?"[^"]+"\s+([\s\S]+)$/i.exec(stmt);
  if (!m) {
    return null;
  }
  const actions = splitTopLevelAlterActions(m[1]);
  return actions.length === 1 ? actions[0] : null;
}

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
        // P1 fix: structural full-statement check (exactly one top-level
        // ALTER TABLE action clause), not a verb blacklist — see
        // getSoleAlterTableActionClause's own comment for why.
        const singleAction = getSoleAlterTableActionClause(stmt) !== null;
        const hasNotNull = /\bNOT\s+NULL\b/.test(upper);
        const hasDefault = /\bDEFAULT\b/.test(upper);
        if (addColumnOnly && singleAction && !hasNotNull && !hasDefault) {
          continue; // approved additive nullable ADD COLUMN (G-19)
        }
        // Phase 3 / D4 / G-20: ENABLE/FORCE ROW LEVEL SECURITY alone, on an
        // existing table, with no other clause — access-control metadata
        // only, reversible via DISABLE ROW LEVEL SECURITY.
        const isRlsToggleOnly =
          /^ALTER\s+TABLE\s+(?:ONLY\s+)?"[^"]+"\s+(?:ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY\s*$/i.test(
            stmt,
          );
        if (isRlsToggleOnly) {
          continue; // approved additive RLS enable/force toggle (D4/G-20)
        }
        // Phase 4 W6 / P4-D3: a composite ownership FK, single action only,
        // on an existing table — permitted ONLY when the exact shape,
        // table, scope token, local column, AND referenced table all match
        // the canonical definition recorded for that constraint name.
        if (singleAction && isApprovedCompositeOwnershipFk(stmt)) {
          continue; // approved additive composite ownership FK (P4-D3)
        }
        violations.push(
          `ALTER TABLE on a table not created in this migration ("${target}") is not allowed in an additive migration ` +
            `(G-19 permits ONLY a single nullable ADD COLUMN with no DEFAULT / NOT NULL; D4/G-20 additionally permits a bare ENABLE/FORCE ROW LEVEL SECURITY; P4-D3 additionally permits an approved composite ownership FK by exact shape AND name): ${stmt.slice(0, 120)}`,
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

    // Phase 3 / D4 / G-20 (docs/saas/DECISIONS.md): a bare ENABLE/FORCE ROW
    // LEVEL SECURITY on an earlier-migration table is now permitted — and
    // ONLY that, with no other clause on the same statement.
    it('D4/G-20: permits a bare ENABLE/FORCE ROW LEVEL SECURITY on an earlier-migration table', () => {
      expect(
        findAdditiveOnlyViolations(
          'ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;',
        ),
      ).toEqual([]);
      expect(
        findAdditiveOnlyViolations(
          'ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;',
        ),
      ).toEqual([]);
      expect(
        findAdditiveOnlyViolations(
          'ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY; ALTER TABLE "stores" FORCE ROW LEVEL SECURITY; CREATE POLICY "p" ON "stores" USING (true);',
        ),
      ).toEqual([]);
    });

    it('D4/G-20: still rejects ROW LEVEL SECURITY combined with any other action, and rejects DISABLE', () => {
      const cases = [
        'ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY, ADD COLUMN "x" TEXT;', // combined
        'ALTER TABLE "tenants" DISABLE ROW LEVEL SECURITY;', // disable is a removal of protection, not additive
        'ALTER TABLE "tenants" NO FORCE ROW LEVEL SECURITY;', // weakening the force setting
      ];
      for (const sql of cases) {
        expect(findAdditiveOnlyViolations(sql)).not.toHaveLength(0);
      }
    });

    // Phase 4 W6 / P4-D3 (docs/saas/DECISIONS.md; docs/saas/PHASE-4-W6-
    // DECISION-DOCKET.md §4.1) — a composite ownership FK on an
    // earlier-migration table is now permitted, but ONLY when both the
    // exact shape AND the exact allowlisted name match.
    describe('P4-D3: composite ownership FK exemption', () => {
      // The exact 19 approved FKs, verbatim from the W6 docket §4.1.
      const APPROVED_FKS: { name: string; sql: string }[] = [
        {
          name: 'categories_storeId_parentCategoryId_fkey',
          sql: 'ALTER TABLE "categories" ADD CONSTRAINT "categories_storeId_parentCategoryId_fkey" FOREIGN KEY ("storeId", "parentCategoryId") REFERENCES "categories"("storeId", "id");',
        },
        {
          name: 'products_storeId_categoryId_fkey',
          sql: 'ALTER TABLE "products" ADD CONSTRAINT "products_storeId_categoryId_fkey" FOREIGN KEY ("storeId", "categoryId") REFERENCES "categories"("storeId", "id") ON DELETE RESTRICT;',
        },
        {
          name: 'product_images_storeId_productId_fkey',
          sql: 'ALTER TABLE "product_images" ADD CONSTRAINT "product_images_storeId_productId_fkey" FOREIGN KEY ("storeId", "productId") REFERENCES "products"("storeId", "id");',
        },
        {
          name: 'product_variants_storeId_productId_fkey',
          sql: 'ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_storeId_productId_fkey" FOREIGN KEY ("storeId", "productId") REFERENCES "products"("storeId", "id");',
        },
        {
          name: 'customization_fields_storeId_productId_fkey',
          sql: 'ALTER TABLE "customization_fields" ADD CONSTRAINT "customization_fields_storeId_productId_fkey" FOREIGN KEY ("storeId", "productId") REFERENCES "products"("storeId", "id");',
        },
        {
          name: 'cart_items_storeId_productId_fkey',
          sql: 'ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_storeId_productId_fkey" FOREIGN KEY ("storeId", "productId") REFERENCES "products"("storeId", "id") ON DELETE RESTRICT;',
        },
        {
          name: 'cart_items_storeId_variantId_fkey',
          sql: 'ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_storeId_variantId_fkey" FOREIGN KEY ("storeId", "variantId") REFERENCES "product_variants"("storeId", "id") ON DELETE RESTRICT;',
        },
        {
          name: 'cart_item_customizations_storeId_customizationFieldId_fkey',
          sql: 'ALTER TABLE "cart_item_customizations" ADD CONSTRAINT "cart_item_customizations_storeId_customizationFieldId_fkey" FOREIGN KEY ("storeId", "customizationFieldId") REFERENCES "customization_fields"("storeId", "id");',
        },
        {
          name: 'orders_storeId_couponId_fkey',
          sql: 'ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_couponId_fkey" FOREIGN KEY ("storeId", "couponId") REFERENCES "coupons"("storeId", "id") ON DELETE SET NULL;',
        },
        {
          name: 'order_items_storeId_productId_fkey',
          sql: 'ALTER TABLE "order_items" ADD CONSTRAINT "order_items_storeId_productId_fkey" FOREIGN KEY ("storeId", "productId") REFERENCES "products"("storeId", "id") ON DELETE SET NULL;',
        },
        {
          name: 'invoices_tenantId_orderId_fkey',
          sql: 'ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "orders"("tenantId", "id") ON DELETE RESTRICT;',
        },
        {
          name: 'payment_attempts_tenantId_orderId_fkey',
          sql: 'ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "orders"("tenantId", "id") ON DELETE RESTRICT;',
        },
        {
          name: 'refunds_tenantId_paymentAttemptId_fkey',
          sql: 'ALTER TABLE "refunds" ADD CONSTRAINT "refunds_tenantId_paymentAttemptId_fkey" FOREIGN KEY ("tenantId", "paymentAttemptId") REFERENCES "payment_attempts"("tenantId", "id") ON DELETE RESTRICT;',
        },
        {
          name: 'order_status_history_tenantId_orderId_fkey',
          sql: 'ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "orders"("tenantId", "id");',
        },
        {
          name: 'coupons_storeId_categoryId_fkey',
          sql: 'ALTER TABLE "coupons" ADD CONSTRAINT "coupons_storeId_categoryId_fkey" FOREIGN KEY ("storeId", "categoryId") REFERENCES "categories"("storeId", "id") ON DELETE SET NULL;',
        },
        {
          name: 'coupon_usages_storeId_couponId_fkey',
          sql: 'ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_storeId_couponId_fkey" FOREIGN KEY ("storeId", "couponId") REFERENCES "coupons"("storeId", "id") ON DELETE RESTRICT;',
        },
        {
          name: 'coupon_usages_tenantId_orderId_fkey',
          sql: 'ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "orders"("tenantId", "id") ON DELETE RESTRICT;',
        },
        {
          name: 'reviews_storeId_productId_fkey',
          sql: 'ALTER TABLE "reviews" ADD CONSTRAINT "reviews_storeId_productId_fkey" FOREIGN KEY ("storeId", "productId") REFERENCES "products"("storeId", "id") ON DELETE RESTRICT;',
        },
        {
          name: 'reviews_storeId_orderItemId_fkey',
          sql: 'ALTER TABLE "reviews" ADD CONSTRAINT "reviews_storeId_orderItemId_fkey" FOREIGN KEY ("storeId", "orderItemId") REFERENCES "order_items"("storeId", "id") ON DELETE RESTRICT;',
        },
      ];

      it('there are exactly 19 approved FKs (guards this test file against silently drifting from the docket)', () => {
        expect(APPROVED_FKS).toHaveLength(19);
        expect(W6_APPROVED_COMPOSITE_FKS.size).toBe(19);
      });

      it.each(APPROVED_FKS.map((fk) => [fk.name, fk.sql] as const))(
        'permits the approved FK alone: %s',
        (_name, sql) => {
          expect(findAdditiveOnlyViolations(sql)).toEqual([]);
        },
      );

      it('permits all 19 approved FKs together in one migration file', () => {
        const sql = APPROVED_FKS.map((fk) => fk.sql).join('\n');
        expect(findAdditiveOnlyViolations(sql)).toEqual([]);
      });

      it('same-scope-token backreference: the referenced side must use the SAME token as the local side', () => {
        // Local side "storeId", referenced side "tenantId" — same class of
        // token, but NOT the same one. Must be rejected even though the
        // name would otherwise be on the allowlist for a *storeId* FK.
        const sql =
          'ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_couponId_fkey" FOREIGN KEY ("storeId", "couponId") REFERENCES "coupons"("tenantId", "id");';
        expect(findAdditiveOnlyViolations(sql)).not.toHaveLength(0);
      });

      it('rejects a shape-matching FK whose constraint name is off the allowlist', () => {
        const sql =
          'ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_couponId_MADE_UP_NAME" FOREIGN KEY ("storeId", "couponId") REFERENCES "coupons"("storeId", "id");';
        expect(findAdditiveOnlyViolations(sql)).not.toHaveLength(0);
      });

      it('rejects an on-allowlist name attached to a hand-edited, unsafe shape', () => {
        // Same approved name, but the columns have been changed to point
        // at unrelated tables/columns — the name alone must not be trusted.
        const sql =
          'ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_couponId_fkey" FOREIGN KEY ("storeId", "userId") REFERENCES "users"("storeId", "id");';
        expect(findAdditiveOnlyViolations(sql)).not.toHaveLength(0);
      });

      it('rejects a composite ownership FK combined with a second action in the same statement', () => {
        const sql =
          'ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_couponId_fkey" FOREIGN KEY ("storeId", "couponId") REFERENCES "coupons"("storeId", "id"), ADD COLUMN "x" TEXT;';
        expect(findAdditiveOnlyViolations(sql)).not.toHaveLength(0);
      });

      it('rejects a composite FK that does not start with tenantId/storeId (not an ownership FK)', () => {
        const sql =
          'ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_couponId_fkey" FOREIGN KEY ("userId", "couponId") REFERENCES "coupons"("userId", "id");';
        expect(findAdditiveOnlyViolations(sql)).not.toHaveLength(0);
      });

      it('regression: every previously-rejected shape remains rejected (P4-D3 does not widen anything else)', () => {
        const cases = [
          'DROP TABLE "orders";',
          'ALTER TABLE "orders" DROP COLUMN "total";',
          'ALTER TABLE "orders" ADD COLUMN "note" TEXT NOT NULL;',
          'ALTER TABLE "users" ADD COLUMN "x" TEXT, ADD COLUMN "z" TEXT;',
          'ALTER TABLE "tenants" DISABLE ROW LEVEL SECURITY;',
          'DELETE FROM "orders";',
          'TRUNCATE TABLE "orders";',
          `UPDATE "orders" SET "total" = 0;`,
          'ALTER TABLE "widgets" ALTER COLUMN "x" SET NOT NULL;',
        ];
        for (const sql of cases) {
          expect(findAdditiveOnlyViolations(sql)).not.toHaveLength(0);
        }
      });
    });

    // P1 fix (independent audit finding; docs/saas/PHASE-4-IMPLEMENTATION-
    // REPORT.md §18) — the old `singleAction` keyword blacklist
    // (`,\s*(?:ADD|DROP|ALTER|RENAME)`) missed non-blacklisted second
    // ALTER TABLE actions. Replaced with a structural, paren/quote-aware
    // full-statement clause count (`getSoleAlterTableActionClause`). These
    // tests prove the fix for every verb identified in the finding, plus
    // the two approved exemptions that share the same underlying check.
    describe('P1 fix: structural single-action enforcement (no verb blacklist)', () => {
      const APPROVED_FK_SQL =
        'ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_couponId_fkey" FOREIGN KEY ("storeId", "couponId") REFERENCES "coupons"("storeId", "id") ON DELETE SET NULL ("couponId") ON UPDATE CASCADE;';

      it('1. approved single composite FK alone → PASS', () => {
        expect(findAdditiveOnlyViolations(APPROVED_FK_SQL)).toEqual([]);
      });

      it('2. approved single ADD COLUMN alone → PASS', () => {
        const sql = 'ALTER TABLE "users" ADD COLUMN "auditProbeCol" TEXT;';
        expect(findAdditiveOnlyViolations(sql)).toEqual([]);
      });

      it('3. approved RLS toggle alone → existing behavior remains PASS', () => {
        const sql = 'ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;';
        expect(findAdditiveOnlyViolations(sql)).toEqual([]);
      });

      const SMUGGLE_SUFFIXES: { label: string; suffix: string }[] = [
        {
          label: '4. DISABLE ROW LEVEL SECURITY',
          suffix: ', DISABLE ROW LEVEL SECURITY',
        },
        {
          label: '5. NO FORCE ROW LEVEL SECURITY',
          suffix: ', NO FORCE ROW LEVEL SECURITY',
        },
        {
          label: '6. OWNER TO malicious_role',
          suffix: ', OWNER TO malicious_role',
        },
        {
          label: '7. VALIDATE CONSTRAINT',
          suffix: ', VALIDATE CONSTRAINT "some_other_check"',
        },
        { label: '8. SET SCHEMA', suffix: ', SET SCHEMA "other_schema"' },
        {
          label: '9. SET TABLESPACE',
          suffix: ', SET TABLESPACE "other_tablespace"',
        },
        { label: '10. CLUSTER ON', suffix: ', CLUSTER ON "orders_pkey"' },
      ];

      it.each(
        SMUGGLE_SUFFIXES.map(({ label, suffix }) => [label, suffix] as const),
      )('approved FK + %s smuggled via comma → REJECT', (_label, suffix) => {
        const sql = APPROVED_FK_SQL.replace(/;$/, `${suffix};`);
        expect(findAdditiveOnlyViolations(sql)).not.toHaveLength(0);
      });

      it('11. reversed order — malicious clause FIRST, approved FK second → still REJECT', () => {
        const sql =
          'ALTER TABLE "orders" DISABLE ROW LEVEL SECURITY, ADD CONSTRAINT "orders_storeId_couponId_fkey" FOREIGN KEY ("storeId", "couponId") REFERENCES "coupons"("storeId", "id");';
        expect(findAdditiveOnlyViolations(sql)).not.toHaveLength(0);
      });

      it('same smuggle suffixes also correctly rejected when appended to an approved G-19 ADD COLUMN (shared root cause, shared fix)', () => {
        for (const { suffix } of SMUGGLE_SUFFIXES) {
          const sql = `ALTER TABLE "users" ADD COLUMN "auditProbeCol" TEXT${suffix};`;
          expect(findAdditiveOnlyViolations(sql)).not.toHaveLength(0);
        }
      });

      it('a comma inside the FK column list / ON DELETE column-specifier is never mistaken for a second action', () => {
        // Sanity: the structural clause-splitter must not itself become a
        // false-positive source — the approved FK's own internal commas
        // (inside the column lists) must not cause it to be misread as
        // multiple actions.
        expect(findAdditiveOnlyViolations(APPROVED_FK_SQL)).toEqual([]);
      });

      it('12. generic multi-action ADD/DROP/ALTER/RENAME combinations remain rejected (regression)', () => {
        const cases = [
          'ALTER TABLE "users" ADD COLUMN "x" TEXT, ADD COLUMN "y" TEXT;',
          'ALTER TABLE "users" ADD COLUMN "x" TEXT, DROP COLUMN "y";',
          'ALTER TABLE "users" ADD COLUMN "x" TEXT, ALTER COLUMN "y" SET NOT NULL;',
          'ALTER TABLE "users" ADD COLUMN "x" TEXT, RENAME COLUMN "y" TO "z";',
        ];
        for (const sql of cases) {
          expect(findAdditiveOnlyViolations(sql)).not.toHaveLength(0);
        }
      });
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
