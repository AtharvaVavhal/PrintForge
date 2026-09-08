import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Phase 4, waves W4 (catalog + settings) + W5 (commerce + customer data) —
 * backfill script. NOT a Prisma migration, NOT `prisma db seed`
 * (docs/saas/PHASE-4-START-GATE-AND-IMPLEMENTATION-SPEC.md §8: backfill is
 * DML against existing rows, explicitly kept out of `prisma/migrations/`
 * and out of the additive-only migration-safety guard's scope).
 *
 * Implements the exact per-table ownership/backfill strategy from spec §3,
 * decision P4-D1 (Option B — `userId` stays the live path; `customerId` is
 * backfill-only, populated only where a `Customer` row already exists for a
 * `role='CUSTOMER'` `User`), and decision D10 (`TenantCounter` seeded from
 * the existing `app_settings` counter rows' current value — see
 * `validateCounterAgainstMax`/`seedTenantCounters` below).
 *
 * SAFETY GATE (P2 fix — independent W4 audit, docs/saas/PHASE-4-
 * IMPLEMENTATION-REPORT.md §12): seeding a `TenantCounter` from the raw
 * `app_settings` value assumes that value already equals the actual MAX
 * issued number. That assumption is NOT always true — proven empirically:
 * `printforge_dev`'s `order_number_counter` = 52 while the actual MAX
 * issued order number is 51 (zero gaps in 1..51). `seedTenantCounters` now
 * cross-checks the source counter against the real `MAX(<numberColumn>)`
 * in its business table before seeding anything, and REFUSES to create the
 * `TenantCounter` row at all unless they match exactly — reporting a named
 * anomaly instead. Nothing is ever auto-corrected (neither the
 * `app_settings` row nor a "safer" substituted value) — an inconsistency is
 * surfaced for human resolution, never silently repaired.
 *
 * Design invariants (why this is safe to run more than once):
 *  - every UPDATE's WHERE clause includes "<column> IS NULL" — an
 *    already-backfilled row is never touched again, so a rerun is a
 *    guaranteed no-op for every row it already processed (idempotent by
 *    construction, not by a separate dedup check).
 *  - nothing is ever set to anything other than NULL -> a real value; the
 *    tool never overwrites an existing non-NULL value, so it cannot
 *    "correct" a wrong prior value — that is a deliberate safety property,
 *    not a limitation (see docs/saas/PHASE-4-IMPLEMENTATION-REPORT.md §12).
 *  - --tenant-id / --store-id are REQUIRED explicit arguments, validated
 *    against the DB before anything runs (existence, store belongs to
 *    tenant, store is primary) — this tool never guesses or auto-discovers
 *    a target, and accepts no unvalidated/"trusted client" input of any
 *    kind (it is an operator-run CLI tool, not an HTTP endpoint).
 *
 * DRY-RUN implementation note (important): later steps copy tenantId/
 * storeId from a PARENT row this same run just set (e.g. `order_items`
 * copies from `orders`). A dry-run that only *counts* eligible rows without
 * ever writing would see every parent still NULL when it reaches a child
 * step, undercounting to near-zero for every derived table — a real
 * fidelity bug, not a hypothetical one (caught by actually running it: see
 * docs/saas/PHASE-4-IMPLEMENTATION-REPORT.md §12). The fix: dry-run mode
 * runs the SAME real UPDATE statements as a real run, inside ONE single
 * transaction that ALWAYS rolls back at the end (Postgres DDL/DML is fully
 * transactional; this exact rollback-only technique is already proven in
 * this codebase — test/e2e/tenant-rls.e2e-spec.ts's `inRolledBackTransaction`).
 * Real-run mode instead commits each step in its OWN transaction, so a
 * failure partway through leaves every already-completed step's work
 * intact rather than rolling back the whole run.
 *
 * Usage:
 *   npx ts-node prisma/backfill/w4-backfill.ts --tenant-id=<uuid> --store-id=<uuid> --dry-run
 *   npx ts-node prisma/backfill/w4-backfill.ts --tenant-id=<uuid> --store-id=<uuid>
 *
 * Explicitly NOT done here (out of scope, matches the approved spec):
 *  - W6 composite FKs/uniques, W7 NOT NULL/contract changes.
 *  - `AppSetting` -> `TenantSetting`/`StoreSetting` migration (D11) — those
 *    Prisma models do not exist yet (only `TenantCounter`, added in W3);
 *    see docs/saas/PHASE-4-IMPLEMENTATION-REPORT.md §12 "Blocked" note.
 *    Only the two counter keys (which map onto the existing `TenantCounter`
 *    table) are handled here.
 */

const prisma = new PrismaClient();

// ─── CLI / target resolution ───────────────────────────────────────────────

interface Args {
  tenantId: string;
  storeId: string;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const withEq = argv.find((a) => a.startsWith(`--${name}=`));
    if (withEq) return withEq.slice(`--${name}=`.length);
    const idx = argv.indexOf(`--${name}`);
    if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) {
      return argv[idx + 1];
    }
    return undefined;
  };
  const tenantId = get('tenant-id') ?? process.env.W4_TENANT_ID;
  const storeId = get('store-id') ?? process.env.W4_STORE_ID;
  const dryRun = argv.includes('--dry-run');
  if (!tenantId || !storeId) {
    throw new Error(
      'Both --tenant-id=<uuid> and --store-id=<uuid> are required ' +
        '(or W4_TENANT_ID / W4_STORE_ID env vars). This tool never guesses ' +
        'or auto-discovers the target tenant/store.',
    );
  }
  return { tenantId, storeId, dryRun };
}

async function validateTarget(tenantId: string, storeId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new Error(`--tenant-id ${tenantId} does not exist.`);
  }
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) {
    throw new Error(`--store-id ${storeId} does not exist.`);
  }
  if (store.tenantId !== tenantId) {
    throw new Error(
      `--store-id ${storeId} belongs to tenant ${store.tenantId}, not ${tenantId}.`,
    );
  }
  if (!store.isPrimary) {
    throw new Error(
      `--store-id ${storeId} is not the primary store for tenant ${tenantId}. ` +
        "Refusing: Phase 4 W4/W5 targets the tenant's primary store only (spec §3).",
    );
  }
}

// ─── Result reporting ───────────────────────────────────────────────────────

interface StepResult {
  step: string;
  table: string;
  column: string;
  /** rows actually affected by this step's UPDATE/INSERT (real run: persisted; dry-run: rolled back at the very end, but the number is real). */
  affected: number;
  anomalies?: Record<string, number>;
  /** human-readable detail for an anomaly that a bare count can't convey (e.g. exact drift numbers). */
  detail?: string;
}

type Client = PrismaClient | Prisma.TransactionClient;

// ─── Reusable step shapes (every step performs a REAL write — see file header for why dry-run mode wraps the whole run in a rollback-only transaction instead of skipping writes) ──

/** Category/Product/Coupon/[tenantId+storeId half of Cart/Order/Review]: direct assignment to the target tenant/store, single-tenant-source (spec §3: "-> Tenant #1 / primary store"). */
async function directAssignTenantStore(
  client: Client,
  table: string,
  tenantId: string,
  storeId: string,
): Promise<StepResult> {
  const t = Prisma.raw(`"${table}"`);
  const affected = await client.$executeRaw(
    Prisma.sql`UPDATE ${t} SET "tenantId" = ${tenantId}, "storeId" = ${storeId} WHERE "tenantId" IS NULL`,
  );
  return { step: table, table, column: 'tenantId,storeId', affected };
}

/** Invoice/PaymentAttempt/Refund/OrderStatusHistory (tenantId only): copy the parent's tenantId — spec §3's "Copy parent" / "Copy grandparent" backfill note. */
async function copyTenantFromParent(
  client: Client,
  table: string,
  fkColumn: string,
  parentTable: string,
): Promise<StepResult> {
  const t = Prisma.raw(`"${table}"`);
  const fk = Prisma.raw(`"${fkColumn}"`);
  const p = Prisma.raw(`"${parentTable}"`);
  const affected = await client.$executeRaw(
    Prisma.sql`
      UPDATE ${t} c SET "tenantId" = par."tenantId"
      FROM ${p} par
      WHERE c.${fk} = par.id AND c."tenantId" IS NULL AND par."tenantId" IS NOT NULL
    `,
  );
  return { step: table, table, column: 'tenantId', affected };
}

/** ProductImage/ProductVariant/CustomizationField/CartItem/CartItemCustomization/OrderItem/OrderItemCustomization/CouponUsage: copy the parent's tenantId AND storeId. */
async function copyTenantAndStoreFromParent(
  client: Client,
  table: string,
  fkColumn: string,
  parentTable: string,
): Promise<StepResult> {
  const t = Prisma.raw(`"${table}"`);
  const fk = Prisma.raw(`"${fkColumn}"`);
  const p = Prisma.raw(`"${parentTable}"`);
  const affected = await client.$executeRaw(
    Prisma.sql`
      UPDATE ${t} c SET "tenantId" = par."tenantId", "storeId" = par."storeId"
      FROM ${p} par
      WHERE c.${fk} = par.id AND c."tenantId" IS NULL AND par."tenantId" IS NOT NULL
    `,
  );
  return { step: table, table, column: 'tenantId,storeId', affected };
}

/**
 * Cart/Order/Review/CouponUsage/IdempotencyKey: customerId <- the Customer
 * row matching (storeId, User.email) for the acting User, ONLY when that
 * User's role is CUSTOMER (P4-D1's exact reconciliation criterion: "COUNT
 * of rows with customerId set == COUNT of rows whose userId maps to a
 * role='CUSTOMER' User"). Reports an anomaly count for role='CUSTOMER'
 * users with NO matching Customer row (should be 0 if Phase 2b already ran
 * — reported, never silently skipped).
 */
async function customerIdFromUserJoin(
  client: Client,
  table: string,
  userIdColumn: string,
  customerIdColumn: string,
  storeId: string,
): Promise<StepResult> {
  const t = Prisma.raw(`"${table}"`);
  const uidCol = Prisma.raw(`"${userIdColumn}"`);
  const cidCol = Prisma.raw(`"${customerIdColumn}"`);

  const [{ count: unresolvedCount }] = await client.$queryRaw<
    { count: bigint }[]
  >(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM ${t} x
      JOIN users u ON u.id = x.${uidCol}
      WHERE u.role = 'CUSTOMER'
        AND x.${cidCol} IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM customers c WHERE c."storeId" = ${storeId} AND c.email = u.email
        )
    `,
  );
  const unresolved = Number(unresolvedCount);

  const affected = await client.$executeRaw(
    Prisma.sql`
      UPDATE ${t} x SET ${cidCol} = c.id
      FROM users u, customers c
      WHERE x.${uidCol} = u.id
        AND c."storeId" = ${storeId} AND c.email = u.email
        AND u.role = 'CUSTOMER'
        AND x.${cidCol} IS NULL
    `,
  );
  return {
    step: `${table}.${customerIdColumn}`,
    table,
    column: customerIdColumn,
    affected,
    anomalies:
      unresolved > 0
        ? { customer_role_user_with_no_matching_customer_row: unresolved }
        : undefined,
  };
}

// ─── Table-specific steps ───────────────────────────────────────────────────

/** UploadedFile.tenantId — every row -> target tenant (single-tenant source). */
async function uploadedFileTenantId(
  client: Client,
  tenantId: string,
): Promise<StepResult> {
  const affected = await client.$executeRaw(
    Prisma.sql`UPDATE "uploaded_files" SET "tenantId" = ${tenantId} WHERE "tenantId" IS NULL`,
  );
  return { step: 'uploaded_files.tenantId', table: 'uploaded_files', column: 'tenantId', affected };
}

/** UploadedFile.uploadedByCustomerId — via uploadedByUserId, same join shape as customerIdFromUserJoin but a distinct FK column name. */
async function uploadedFileCustomerId(
  client: Client,
  storeId: string,
): Promise<StepResult> {
  return customerIdFromUserJoin(
    client,
    'uploaded_files',
    'uploadedByUserId',
    'uploadedByCustomerId',
    storeId,
  );
}

/**
 * IdempotencyKey.tenantId — spec §3: "Copy from the order it dedups, or the
 * acting user's migrated Customer" -> two passes: (a) copy from the
 * resultOrder when resultOrderId is set, (b) direct-assign the target
 * tenant for whatever remains (resultOrderId IS NULL — no order to copy
 * from, so the single target tenant today, per §3's "acting user's ...
 * Customer" alternative path).
 */
async function idempotencyKeyTenantId(
  client: Client,
  tenantId: string,
): Promise<StepResult[]> {
  const fromOrder = await client.$executeRaw(
    Prisma.sql`
      UPDATE "idempotency_keys" ik SET "tenantId" = o."tenantId"
      FROM orders o
      WHERE ik."resultOrderId" = o.id AND ik."tenantId" IS NULL AND o."tenantId" IS NOT NULL
    `,
  );
  const direct = await client.$executeRaw(
    Prisma.sql`UPDATE "idempotency_keys" SET "tenantId" = ${tenantId} WHERE "tenantId" IS NULL`,
  );
  return [
    {
      step: 'idempotency_keys.tenantId (via resultOrder)',
      table: 'idempotency_keys',
      column: 'tenantId',
      affected: fromOrder,
    },
    {
      step: 'idempotency_keys.tenantId (direct, no resultOrder)',
      table: 'idempotency_keys',
      column: 'tenantId',
      affected: direct,
    },
  ];
}

/**
 * OutboxEvent.tenantId — conditional per spec §3.6: `aggregateType='Order'`
 * rows resolve via `aggregateId` -> `orders.id`; every other aggregateType
 * (the codebase currently only ever writes 'Order' or 'User' — grep-verified
 * in src/payments/payments.service.ts, src/orders/orders.service.ts,
 * src/auth/auth.service.ts) is identity-scoped and stays NULL FOREVER, not
 * just for this wave — the one deliberate permanent exception the spec
 * itself names (never `SET NOT NULL` even in W7).
 */
async function outboxEventTenantId(client: Client): Promise<StepResult> {
  const affected = await client.$executeRaw(
    Prisma.sql`
      UPDATE "outbox_events" oe SET "tenantId" = o."tenantId"
      FROM orders o
      WHERE oe."aggregateId" = o.id AND oe."aggregateType" = 'Order'
        AND oe."tenantId" IS NULL AND o."tenantId" IS NOT NULL
    `,
  );
  return { step: 'outbox_events.tenantId', table: 'outbox_events', column: 'tenantId', affected };
}

/** OrderStatusHistory.changedByCustomerId — via changedByUserId (nullable). changedByMembershipId is deliberately NOT populated by this backfill — see docs/saas/PHASE-4-IMPLEMENTATION-REPORT.md §12 for why. */
async function orderStatusHistoryChangedByCustomerId(
  client: Client,
  storeId: string,
): Promise<StepResult> {
  return customerIdFromUserJoin(
    client,
    'order_status_history',
    'changedByUserId',
    'changedByCustomerId',
    storeId,
  );
}

/**
 * Extracts the trailing digit run from a generated order/invoice number
 * string — mirroring, not inventing, the exact generation templates:
 * `orders.service.ts::generateOrderNumber` -> `` `PF-${counter.padStart(6,'0')}` ``
 * and `invoice-number.service.ts::allocate` -> `` `${prefix}${value.padStart(6,'0')}` ``.
 * There is no existing PARSE-back function anywhere in the codebase (grep-
 * verified) — the number is only ever generated, never re-parsed — so this
 * is derived directly from those two template literals, not assumed. A
 * fixed-prefix regex (e.g. hardcoding "PF-" or the *current*
 * `invoice.numberPrefix`) would be wrong for `invoiceNumber`: that prefix
 * is a mutable, admin-editable `AppSetting`
 * (`app-setting.constants.ts`'s `invoice.numberPrefix`), so a historical
 * invoice issued under an older prefix would silently fail to match and be
 * skipped from the MAX computation, undercounting the true maximum. The
 * digit-padding shape is the one part of the format that is stable
 * regardless of prefix, so matching only the trailing digit run is the
 * correct, format-faithful parse — not a new invented format.
 */
function parseTrailingNumber(value: string): number | null {
  const m = /(\d+)$/.exec(value);
  if (!m) return null;
  return Number.parseInt(m[1], 10);
}

type CounterValidationStatus =
  | 'PASS'
  | 'BELOW_MAX'
  | 'ABOVE_MAX'
  | 'MALFORMED'
  | 'SOURCE_MALFORMED'
  | 'NO_SOURCE_ROW';

interface CounterValidation {
  key: string;
  sourceValue: number | null;
  actualMax: number | null;
  malformedCount: number;
  status: CounterValidationStatus;
}

/**
 * Compares a source `app_settings` counter's current value against the
 * ACTUAL maximum already-issued number in its corresponding business table
 * (decision D10 — Phase 4 W3/W4 audit P2 finding, docs/saas/PHASE-4-
 * IMPLEMENTATION-REPORT.md §12). Read-only — never writes.
 *
 *   PASS            source counter == actual MAX -> safe to seed verbatim.
 *   BELOW_MAX       source counter < actual MAX -> DANGEROUS: seeding this
 *                    verbatim would let a future claim re-issue a number
 *                    that already exists (a real collision risk, not just
 *                    a skipped one) — never seed.
 *   ABOVE_MAX       source counter > actual MAX -> the exact drift this
 *                    check exists to catch (found for real in
 *                    printforge_dev's order_number_counter: 52 vs actual
 *                    MAX 51, zero gaps in 1..51). Seeding this verbatim
 *                    would silently skip every number between actual MAX
 *                    and the source value forever. Per this task's explicit
 *                    instruction ("do NOT rewrite app_settings automatically
 *                    ... surfaced, not silently repaired") this is NOT
 *                    auto-corrected to actualMax either — that would be
 *                    silently picking a different value without human
 *                    review. Both directions refuse to seed.
 *   MALFORMED       at least one existing number in the business table
 *                    doesn't end in a digit run at all — the MAX can't be
 *                    trusted, so refuse to seed (fail safe, never guess).
 *   SOURCE_MALFORMED the app_settings row's own `value` isn't a parseable
 *                    integer.
 *   NO_SOURCE_ROW    no app_settings row for this key exists yet (nothing
 *                    to seed — not an error, this key was simply never
 *                    claimed).
 */
async function validateCounterAgainstMax(
  client: Client,
  key: string,
  table: string,
  numberColumn: string,
): Promise<CounterValidation> {
  const rows = await client.$queryRaw<{ value: string }[]>(
    Prisma.sql`SELECT value FROM app_settings WHERE key = ${key}`,
  );
  if (rows.length === 0) {
    return { key, sourceValue: null, actualMax: null, malformedCount: 0, status: 'NO_SOURCE_ROW' };
  }
  const sourceValue = Number.parseInt(rows[0].value, 10);
  if (!Number.isFinite(sourceValue)) {
    return { key, sourceValue: null, actualMax: null, malformedCount: 0, status: 'SOURCE_MALFORMED' };
  }

  const col = Prisma.raw(`"${numberColumn}"`);
  const t = Prisma.raw(`"${table}"`);
  const numberRows = await client.$queryRaw<{ v: string }[]>(
    Prisma.sql`SELECT ${col} AS v FROM ${t}`,
  );

  let actualMax = 0;
  let malformedCount = 0;
  for (const r of numberRows) {
    const n = parseTrailingNumber(r.v);
    if (n === null) {
      malformedCount++;
      continue;
    }
    if (n > actualMax) actualMax = n;
  }

  if (malformedCount > 0) {
    return { key, sourceValue, actualMax, malformedCount, status: 'MALFORMED' };
  }
  if (sourceValue < actualMax) {
    return { key, sourceValue, actualMax, malformedCount: 0, status: 'BELOW_MAX' };
  }
  if (sourceValue > actualMax) {
    return { key, sourceValue, actualMax, malformedCount: 0, status: 'ABOVE_MAX' };
  }
  return { key, sourceValue, actualMax, malformedCount: 0, status: 'PASS' };
}

const COUNTER_SPECS: { key: string; table: string; column: string }[] = [
  { key: 'order_number_counter', table: 'orders', column: 'orderNumber' },
  { key: 'invoice_number_counter', table: 'invoices', column: 'invoiceNumber' },
];

/**
 * TenantCounter seeding from the existing app_settings counters — GATED on
 * `validateCounterAgainstMax` returning PASS. Any other status REFUSES to
 * create the TenantCounter row at all (no unsafe value is ever created or
 * accepted) and reports a specific, named anomaly with the exact
 * source/actual numbers instead — never silently seeded, never
 * auto-corrected, never guessed.
 */
async function seedTenantCounters(
  client: Client,
  tenantId: string,
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const { key, table, column } of COUNTER_SPECS) {
    const v = await validateCounterAgainstMax(client, key, table, column);

    if (v.status === 'NO_SOURCE_ROW') {
      results.push({
        step: `tenant_counters (${key})`,
        table: 'tenant_counters',
        column: 'value',
        affected: 0,
        anomalies: { no_app_settings_row_for_key: 1 },
      });
      continue;
    }

    if (v.status !== 'PASS') {
      const anomalyKey = `counter_${v.status.toLowerCase()}`;
      results.push({
        step: `tenant_counters (${key})`,
        table: 'tenant_counters',
        column: 'value',
        affected: 0,
        anomalies: { [anomalyKey]: 1 },
        detail:
          v.status === 'MALFORMED'
            ? `${v.malformedCount} row(s) in "${table}"."${column}" do not end in a digit run — refusing to seed (source=${v.sourceValue})`
            : v.status === 'SOURCE_MALFORMED'
              ? `app_settings.${key}.value is not a parseable integer — refusing to seed`
              : `source app_settings.${key} = ${v.sourceValue}, actual MAX("${column}") in "${table}" = ${v.actualMax} (${v.status === 'ABOVE_MAX' ? 'source is ahead of' : 'source is BEHIND'} actual data) — refusing to seed; resolve the drift manually before retrying`,
      });
      continue; // refuse to create an unsafe TenantCounter row
    }

    const affected = await client.$executeRaw(
      Prisma.sql`
        INSERT INTO tenant_counters (id, "tenantId", key, value, "updatedAt")
        VALUES (gen_random_uuid(), ${tenantId}, ${key}, ${v.sourceValue}, now())
        ON CONFLICT ("tenantId", key) DO NOTHING
      `,
    );
    results.push({
      step: `tenant_counters (${key})`,
      table: 'tenant_counters',
      column: 'value',
      affected,
    });
  }
  return results;
}

// ─── Orchestration ───────────────────────────────────────────────────────

async function runAllSteps(
  client: Client,
  tenantId: string,
  storeId: string,
): Promise<StepResult[]> {
  const results: StepResult[] = [];

  // Dependency order per spec §11: catalog -> coupons -> uploaded files ->
  // cart family -> order family -> coupon usage -> review -> idempotency
  // keys -> outbox events -> counters.
  results.push(await directAssignTenantStore(client, 'categories', tenantId, storeId));
  results.push(await directAssignTenantStore(client, 'products', tenantId, storeId));
  results.push(await copyTenantFromParent(client, 'product_images', 'productId', 'products'));
  results.push(await copyTenantFromParent(client, 'product_variants', 'productId', 'products'));
  results.push(await copyTenantFromParent(client, 'customization_fields', 'productId', 'products'));

  results.push(await directAssignTenantStore(client, 'coupons', tenantId, storeId));

  results.push(await uploadedFileTenantId(client, tenantId));
  results.push(await uploadedFileCustomerId(client, storeId));

  results.push(await directAssignTenantStore(client, 'carts', tenantId, storeId));
  results.push(await customerIdFromUserJoin(client, 'carts', 'userId', 'customerId', storeId));
  results.push(await copyTenantFromParent(client, 'cart_items', 'cartId', 'carts'));
  results.push(await copyTenantFromParent(client, 'cart_item_customizations', 'cartItemId', 'cart_items'));

  results.push(await directAssignTenantStore(client, 'orders', tenantId, storeId));
  results.push(await customerIdFromUserJoin(client, 'orders', 'userId', 'customerId', storeId));
  results.push(await copyTenantFromParent(client, 'order_items', 'orderId', 'orders'));
  results.push(await copyTenantFromParent(client, 'order_item_customizations', 'orderItemId', 'order_items'));
  results.push(await copyTenantFromParent(client, 'invoices', 'orderId', 'orders'));
  results.push(await copyTenantFromParent(client, 'payment_attempts', 'orderId', 'orders'));
  results.push(await copyTenantFromParent(client, 'refunds', 'paymentAttemptId', 'payment_attempts'));
  results.push(await copyTenantFromParent(client, 'order_status_history', 'orderId', 'orders'));
  results.push(await orderStatusHistoryChangedByCustomerId(client, storeId));

  results.push(await copyTenantAndStoreFromParent(client, 'coupon_usages', 'orderId', 'orders'));
  results.push(await customerIdFromUserJoin(client, 'coupon_usages', 'userId', 'customerId', storeId));

  results.push(await directAssignTenantStore(client, 'reviews', tenantId, storeId));
  results.push(await customerIdFromUserJoin(client, 'reviews', 'userId', 'customerId', storeId));

  results.push(...(await idempotencyKeyTenantId(client, tenantId)));
  results.push(await customerIdFromUserJoin(client, 'idempotency_keys', 'userId', 'customerId', storeId));

  results.push(await outboxEventTenantId(client));

  results.push(...(await seedTenantCounters(client, tenantId)));

  return results;
}

const DRY_RUN_ROLLBACK_SENTINEL = 'W4_BACKFILL_DRY_RUN_ROLLBACK_DO_NOT_LEAK';

async function main(): Promise<void> {
  const { tenantId, storeId, dryRun } = parseArgs();
  await validateTarget(tenantId, storeId);

  console.log(
    `Phase 4 W4/W5 backfill — mode=${dryRun ? 'DRY-RUN (transaction always rolled back, nothing persists)' : 'REAL RUN (per-step committed transactions)'} tenantId=${tenantId} storeId=${storeId}`,
  );

  let results: StepResult[] = [];

  if (dryRun) {
    // Single transaction, real writes, ALWAYS rolled back — see file header.
    try {
      await prisma.$transaction(
        async (tx) => {
          results = await runAllSteps(tx, tenantId, storeId);
          throw new Error(DRY_RUN_ROLLBACK_SENTINEL);
        },
        { timeout: 120_000 },
      );
    } catch (err) {
      if (!(err instanceof Error && err.message === DRY_RUN_ROLLBACK_SENTINEL)) {
        throw err;
      }
    }
  } else {
    // Each logical step commits independently.
    const step = async <T>(fn: (tx: Client) => Promise<T>): Promise<T> =>
      prisma.$transaction((tx) => fn(tx), { timeout: 60_000 });

    results.push(await step((c) => directAssignTenantStore(c, 'categories', tenantId, storeId)));
    results.push(await step((c) => directAssignTenantStore(c, 'products', tenantId, storeId)));
    results.push(await step((c) => copyTenantFromParent(c, 'product_images', 'productId', 'products')));
    results.push(await step((c) => copyTenantFromParent(c, 'product_variants', 'productId', 'products')));
    results.push(await step((c) => copyTenantFromParent(c, 'customization_fields', 'productId', 'products')));

    results.push(await step((c) => directAssignTenantStore(c, 'coupons', tenantId, storeId)));

    results.push(await step((c) => uploadedFileTenantId(c, tenantId)));
    results.push(await step((c) => uploadedFileCustomerId(c, storeId)));

    results.push(await step((c) => directAssignTenantStore(c, 'carts', tenantId, storeId)));
    results.push(await step((c) => customerIdFromUserJoin(c, 'carts', 'userId', 'customerId', storeId)));
    results.push(await step((c) => copyTenantFromParent(c, 'cart_items', 'cartId', 'carts')));
    results.push(await step((c) => copyTenantFromParent(c, 'cart_item_customizations', 'cartItemId', 'cart_items')));

    results.push(await step((c) => directAssignTenantStore(c, 'orders', tenantId, storeId)));
    results.push(await step((c) => customerIdFromUserJoin(c, 'orders', 'userId', 'customerId', storeId)));
    results.push(await step((c) => copyTenantFromParent(c, 'order_items', 'orderId', 'orders')));
    results.push(await step((c) => copyTenantFromParent(c, 'order_item_customizations', 'orderItemId', 'order_items')));
    results.push(await step((c) => copyTenantFromParent(c, 'invoices', 'orderId', 'orders')));
    results.push(await step((c) => copyTenantFromParent(c, 'payment_attempts', 'orderId', 'orders')));
    results.push(await step((c) => copyTenantFromParent(c, 'refunds', 'paymentAttemptId', 'payment_attempts')));
    results.push(await step((c) => copyTenantFromParent(c, 'order_status_history', 'orderId', 'orders')));
    results.push(await step((c) => orderStatusHistoryChangedByCustomerId(c, storeId)));

    results.push(await step((c) => copyTenantAndStoreFromParent(c, 'coupon_usages', 'orderId', 'orders')));
    results.push(await step((c) => customerIdFromUserJoin(c, 'coupon_usages', 'userId', 'customerId', storeId)));

    results.push(await step((c) => directAssignTenantStore(c, 'reviews', tenantId, storeId)));
    results.push(await step((c) => customerIdFromUserJoin(c, 'reviews', 'userId', 'customerId', storeId)));

    results.push(...(await step((c) => idempotencyKeyTenantId(c, tenantId))));
    results.push(await step((c) => customerIdFromUserJoin(c, 'idempotency_keys', 'userId', 'customerId', storeId)));

    results.push(await step((c) => outboxEventTenantId(c)));

    results.push(...(await step((c) => seedTenantCounters(c, tenantId))));
  }

  // ─── Summary ───────────────────────────────────────────────────────────
  console.log('\n--- W4/W5 backfill step results ---');
  let totalAffected = 0;
  const allAnomalies: Record<string, number> = {};
  for (const r of results) {
    totalAffected += r.affected;
    console.log(
      `${r.step.padEnd(48)} affected=${r.affected}` +
        (r.anomalies ? `  ANOMALIES=${JSON.stringify(r.anomalies)}` : '') +
        (r.detail ? `  DETAIL=${r.detail}` : ''),
    );
    if (r.anomalies) {
      for (const [k, v] of Object.entries(r.anomalies)) {
        allAnomalies[k] = (allAnomalies[k] ?? 0) + v;
      }
    }
  }
  console.log('\n--- Totals ---');
  console.log(`totalAffected=${totalAffected} (persisted=${!dryRun})`);
  console.log(`anomalies=${JSON.stringify(allAnomalies)}`);
  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run (rolled back)' : 'real-run (committed)',
        tenantId,
        storeId,
        results,
        totalAffected,
        anomalies: allAnomalies,
      },
      null,
      2,
    ),
  );
}

// Only run when executed directly (`ts-node prisma/backfill/w4-backfill.ts`)
// — NOT when imported (e.g. by test/e2e/phase4-w4-backfill.e2e-spec.ts,
// which imports validateTarget/runAllSteps/prisma directly to exercise the
// same logic this CLI entrypoint uses, without ever invoking main()/argv
// parsing).
if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

export {
  prisma,
  validateTarget,
  runAllSteps,
  parseArgs,
  parseTrailingNumber,
  validateCounterAgainstMax,
  COUNTER_SPECS,
};
export type { StepResult, Client, CounterValidation, CounterValidationStatus };
